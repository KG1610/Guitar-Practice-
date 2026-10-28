"""Local riff helper. No accounts, no cookies.

    python3 -m server.riff_server

Downloads a public Facebook / Instagram / YouTube link with yt-dlp, transcodes
it to H.264/AAC for Safari, then estimates tempo, key, and a playable tab.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import traceback
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from server.analyze import analyse_audio
from server.music import build_alphatex, clean_title, hints_from_text, tab_chroma
from server.queue import known_keys, normalize_url, parse_queue, pending_entries, read_local_queue
from server.tab_vision import process_video

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = Path(os.environ.get('RIFF_LIBRARY', ROOT / 'riffs-library'))
PORT = int(os.environ.get('RIFF_PORT', '8787'))
HOST = os.environ.get('RIFF_HOST', '127.0.0.1')
QUEUE_URL = os.environ.get(
    'RIFF_QUEUE_URL',
    'https://raw.githubusercontent.com/KG1610/Guitar-Practice-/main/riffs.json',
)

ALLOWED_HOSTS = {
    'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'fb.com', 'www.fb.watch',
    'instagram.com', 'www.instagram.com',
    'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com',
}

JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


def _which(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    extra = [
        Path.home() / '.local' / 'bin' / name,
        Path('/opt/homebrew/bin') / name,
        Path('/usr/local/bin') / name,
    ]
    for candidate in extra:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def health() -> dict:
    return {
        'ok': True,
        'ffmpeg': bool(_which('ffmpeg')),
        'ffprobe': bool(_which('ffprobe')),
        'ytdlp': bool(_which('yt-dlp')),
        'library': str(LIBRARY),
    }


def _slug(value: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9_-]+', '-', value or '').strip('-')
    return cleaned[:80] or uuid.uuid4().hex[:12]


def _validate_url(url: str) -> str:
    parsed = urlparse((url or '').strip())
    if parsed.scheme not in ('http', 'https'):
        raise ValueError('Paste a full http(s) link.')
    host = (parsed.hostname or '').lower()
    if host not in ALLOWED_HOSTS:
        raise ValueError('Riff Room imports Facebook, Instagram, and YouTube links only.')
    return parsed.geturl()


def _run(cmd: list[str], timeout: int = 180) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=timeout)


def _download(url: str, dest: Path) -> dict:
    if not _which('yt-dlp'):
        raise RuntimeError('yt-dlp is not installed. On a Mac: brew install yt-dlp ffmpeg')
    dest.mkdir(parents=True, exist_ok=True)
    info_path = dest / 'source.info.json'
    output = dest / 'source.%(ext)s'
    cmd = [
        _which('yt-dlp') or 'yt-dlp',
        '--no-playlist',
        '--no-cache-dir',
        '--no-cookies',
        '--no-progress',
        '-f', 'bv*+ba/b',
        '--merge-output-format', 'mp4',
        '--write-info-json',
        '-o', str(output),
        url,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or 'yt-dlp failed').strip().splitlines()
        raise RuntimeError(tail[-1][:400] if tail else 'yt-dlp failed')
    infos = list(dest.glob('source.info.json')) + list(dest.glob('*.info.json'))
    meta = {}
    if infos:
        meta = json.loads(infos[0].read_text())
        if infos[0] != info_path:
            infos[0].replace(info_path)
    media = [p for p in dest.iterdir() if p.suffix.lower() in {'.mp4', '.mkv', '.webm', '.mov'} and p.name != 'video.mp4']
    if not media:
        raise RuntimeError('yt-dlp finished without a video file.')
    return {'file': media[0], 'info': meta}


def _transcode(src: Path, dest: Path) -> None:
    if not _which('ffmpeg'):
        raise RuntimeError('ffmpeg is not installed. On a Mac: brew install ffmpeg')
    cmd = [
        'ffmpeg', '-y', '-i', str(src),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        str(dest),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        # A silent clip still needs a Safari-friendly video track.
        proc = subprocess.run(
            [
                'ffmpeg', '-y', '-i', str(src),
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
                '-an', '-movflags', '+faststart', str(dest),
            ],
            capture_output=True, text=True, timeout=180,
        )
        if proc.returncode != 0:
            tail = (proc.stderr or '').strip().splitlines()
            raise RuntimeError(tail[-1][:400] if tail else 'ffmpeg could not transcode')


def _duration(path: Path) -> float:
    if not _which('ffprobe'):
        return 0.0
    out = subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=nw=1:nk=1', str(path),
    ], text=True).strip()
    try:
        return round(float(out), 3)
    except ValueError:
        return 0.0


def _retarget(tex: str, title: str, artist: str, bpm: float, key: str) -> str:
    body = tex.split('\n.\n', 1)[-1] if '\n.\n' in tex else ':1 r |\n'
    header = build_alphatex([[]], title, artist, bpm, key)
    head = header.split('\n.\n', 1)[0] + '\n.\n'
    return head + body


def _finalise(folder: Path, video: Path, meta: dict, source_url: str) -> dict:
    title = clean_title(meta.get('title') or meta.get('fulltitle') or '', meta.get('uploader') or '')
    if meta.get('titleOverride'):
        title = meta['titleOverride']
    artist = meta.get('uploader') or meta.get('channel') or meta.get('artist') or ''
    description = meta.get('description') or ''
    hints = hints_from_text(title, description, meta.get('fulltitle') or '')
    audio = analyse_audio(
        str(video),
        title_bpm=hints.get('bpm'),
        title_key=hints.get('key'),
    )
    preliminary_bpm = audio['tempo']['bpm'] or hints.get('bpm') or 80
    preliminary_key = hints.get('key') or audio['key']['key']
    vision = process_video(
        str(video),
        title=title,
        artist=artist,
        bpm=preliminary_bpm,
        key=preliminary_key or '',
        work_dir=str(folder),
    )
    tempo = analyse_audio(
        str(video),
        title_bpm=hints.get('bpm'),
        title_key=hints.get('key'),
        visual_bpm=vision.get('visualBpm'),
        score_bpm=vision.get('scoreBpm'),
        tab_chroma=tab_chroma(vision.get('notes') or []),
    )
    bpm = tempo['tempo']['bpm'] or preliminary_bpm
    key = tempo['key']['key'] or preliminary_key or ''
    tex = _retarget(vision.get('alphatex') or '', title, artist, bpm, key)
    (folder / 'tab.alphatex').write_text(tex)
    record = {
        'id': folder.name,
        'title': title,
        'uploader': artist,
        'sourceUrl': source_url,
        'duration': _duration(video),
        'bpm': bpm,
        'bpmNote': tempo['tempo'].get('note'),
        'bpmSource': tempo['tempo'].get('source'),
        'audioBpm': tempo.get('audioBpm'),
        'visualBpm': vision.get('visualBpm'),
        'scoreBpm': vision.get('scoreBpm'),
        'key': key,
        'keyNote': tempo['key'].get('note'),
        'keySource': tempo['key'].get('source'),
        'keyRanking': tempo['key'].get('ranking') or [],
        'notes': '',
        'alphatex': tex,
        'downbeatOffset': vision.get('downbeatOffset') or 0.0,
        'timeline': vision.get('timeline') or {},
        'tabReport': {
            'noteCount': vision.get('noteCount') or 0,
            'barCount': vision.get('barCount') or 0,
            'lowConfidence': vision.get('lowConfidence') or 0,
            'views': vision.get('views') or 0,
            'techniques': vision.get('techniques') or {},
            'warnings': vision.get('warnings') or [],
        },
        'videoId': folder.name,
        'sourceUrls': [source_url] if source_url else [],
        'addedAt': datetime.now(timezone.utc).isoformat(),
        'speed': 1,
        'loopClip': True,
        'video': f"/media/{folder.name}/video.mp4",
        'poster': f"/media/{folder.name}/poster.jpg" if _ensure_poster(folder) else None,
        'tabImage': f"/media/{folder.name}/tab.jpg" if (folder / 'tab.jpg').exists() else None,
        'clearFrame': f"/media/{folder.name}/tab-clear.jpg" if (folder / 'tab-clear.jpg').exists() else None,
        'frames': [
            f"/media/{folder.name}/frames/{path.name}"
            for path in sorted((folder / 'frames').glob('*.jpg'))
        ] if (folder / 'frames').exists() else [],
    }
    (folder / 'riff.json').write_text(json.dumps(record, indent=2))
    return record


def _job(job_id: str, **fields) -> None:
    with LOCK:
        JOBS.setdefault(job_id, {'id': job_id, 'status': 'queued'})
        JOBS[job_id].update(fields)


def _ensure_poster(folder: Path) -> bool:
    poster = folder / 'poster.jpg'
    video = folder / 'video.mp4'
    if poster.is_file():
        return True
    if not video.is_file() or not _which('ffmpeg'):
        return False
    proc = subprocess.run(
        ['ffmpeg', '-y', '-ss', '1', '-i', str(video), '-frames:v', '1',
         '-vf', 'scale=360:-2', str(poster)],
        capture_output=True, text=True, timeout=60,
    )
    return proc.returncode == 0 and poster.is_file()


def _dump_info(url: str) -> dict:
    """Resolve a link to yt-dlp metadata without downloading the video."""
    if not _which('yt-dlp'):
        return {}
    proc = subprocess.run(
        [_which('yt-dlp') or 'yt-dlp', '--no-playlist', '--no-cache-dir', '--no-cookies',
         '--no-download', '--dump-json', url],
        capture_output=True, text=True, timeout=90,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        return {}
    try:
        return json.loads(proc.stdout.splitlines()[-1])
    except json.JSONDecodeError:
        return {}


def _remember_url(record: dict, url: str, notes: str = '') -> dict:
    folder = LIBRARY / _slug(record.get('id') or '')
    path = folder / 'riff.json'
    urls = [item for item in (record.get('sourceUrls') or []) if item]
    if record.get('sourceUrl'):
        urls.append(record['sourceUrl'])
    if url:
        urls.append(url)
    record['sourceUrls'] = sorted(set(urls))
    if notes and not (record.get('notes') or '').strip():
        record['notes'] = notes
    if path.is_file():
        path.write_text(json.dumps(record, indent=2))
    return record


def _existing_for_url(url: str, video_id: str = '') -> dict | None:
    wanted = normalize_url(url)
    ident = f'id:{video_id}' if video_id else ''
    for record in _list_riffs(summaries=False):
        keys = known_keys([record])
        if wanted in keys or (ident and ident in keys):
            return record
    if video_id:
        folder = LIBRARY / _slug(video_id)
        path = folder / 'riff.json'
        if path.is_file():
            try:
                return json.loads(path.read_text())
            except json.JSONDecodeError:
                return None
    return None


def import_url(url: str, job_id: str, title: str = '', notes: str = '') -> dict | None:
    try:
        safe = _validate_url(url)
        already = _existing_for_url(safe)
        if already:
            record = _remember_url(already, safe, notes)
            _job(job_id, status='done', step='Already in the library', riff=record, skipped=True)
            return record
        _job(job_id, status='downloading', step='Checking the link')
        probed = _dump_info(safe)
        video_id = str(probed.get('id') or '')
        if video_id:
            already = _existing_for_url(safe, video_id)
            if already:
                record = _remember_url(already, safe, notes)
                _job(job_id, status='done', step='Already in the library', riff=record, skipped=True)
                return record
        _job(job_id, status='downloading', step='Downloading')
        scratch = LIBRARY / f'.tmp-{job_id}'
        if scratch.exists():
            shutil.rmtree(scratch)
        scratch.mkdir(parents=True)
        got = _download(safe, scratch)
        info = got['info'] or probed
        folder_id = _slug(str(info.get('id') or video_id or job_id))
        folder = LIBRARY / folder_id
        existing_path = folder / 'riff.json'
        if existing_path.is_file():
            shutil.rmtree(scratch, ignore_errors=True)
            record = _remember_url(json.loads(existing_path.read_text()), safe, notes)
            _job(job_id, status='done', step='Already in the library', riff=record, skipped=True)
            return record
        folder.mkdir(parents=True, exist_ok=True)
        _job(job_id, status='transcoding', step='Converting for Safari')
        _transcode(got['file'], folder / 'video.mp4')
        _job(job_id, status='reading', step='Tempo, key, and tab')
        if title:
            info = dict(info)
            info['titleOverride'] = title
        record = _finalise(folder, folder / 'video.mp4', info, safe)
        if notes and not (record.get('notes') or '').strip():
            record['notes'] = notes
            (folder / 'riff.json').write_text(json.dumps(record, indent=2))
        shutil.rmtree(scratch, ignore_errors=True)
        _job(job_id, status='done', step='Ready', riff=record)
        return record
    except Exception as exc:  # noqa: BLE001 - surface to the UI
        _job(job_id, status='error', step='Failed', error=str(exc))
        traceback.print_exc()
        return None


def import_file(src: Path, meta: dict, job_id: str) -> None:
    try:
        folder_id = _slug(meta.get('id') or src.stem or job_id)
        folder = LIBRARY / folder_id
        if folder.exists():
            shutil.rmtree(folder)
        folder.mkdir(parents=True)
        _job(job_id, status='transcoding', step='Converting for Safari')
        _transcode(src, folder / 'video.mp4')
        _job(job_id, status='reading', step='Tempo, key, and tab')
        record = _finalise(folder, folder / 'video.mp4', meta, meta.get('sourceUrl') or '')
        _job(job_id, status='done', step='Ready', riff=record)
    except Exception as exc:  # noqa: BLE001
        _job(job_id, status='error', step='Failed', error=str(exc))
        traceback.print_exc()


def _decorate(record: dict, folder: Path) -> dict:
    record = dict(record)
    record.setdefault('videoId', folder.name)
    record.setdefault('speed', 1)
    record.setdefault('loopClip', True)
    if not record.get('addedAt'):
        stamp = (folder / 'riff.json').stat().st_mtime
        record['addedAt'] = datetime.fromtimestamp(stamp, timezone.utc).isoformat()
    if _ensure_poster(folder):
        record['poster'] = f'/media/{folder.name}/poster.jpg'
    return record


def _summary(record: dict) -> dict:
    return {
        'id': record.get('id'),
        'title': record.get('title') or 'Untitled riff',
        'uploader': record.get('uploader') or '',
        'bpm': record.get('bpm'),
        'key': record.get('key') or '',
        'addedAt': record.get('addedAt'),
        'sourceUrl': record.get('sourceUrl') or '',
        'notes': record.get('notes') or '',
        'poster': record.get('poster'),
        'duration': record.get('duration'),
        'speed': record.get('speed') if record.get('speed') is not None else 1,
    }


def _list_riffs(summaries: bool = False) -> list[dict]:
    LIBRARY.mkdir(parents=True, exist_ok=True)
    found = []
    folders = [folder for folder in LIBRARY.iterdir() if folder.is_dir() and not folder.name.startswith('.')]
    folders.sort(key=lambda folder: (folder / 'riff.json').stat().st_mtime if (folder / 'riff.json').exists() else 0, reverse=True)
    for folder in folders:
        path = folder / 'riff.json'
        if not path.exists():
            continue
        try:
            record = _decorate(json.loads(path.read_text()), folder)
        except json.JSONDecodeError:
            continue
        found.append(_summary(record) if summaries else record)
    return found


def fetch_queue() -> dict:
    """GitHub raw `riffs.json` on main, then the copy in this repo."""
    error = ''
    try:
        request = urllib.request.Request(QUEUE_URL, headers={'User-Agent': 'practice-desk-riff-room'})
        with urllib.request.urlopen(request, timeout=8) as response:
            data = json.loads(response.read().decode())
        return {'source': 'github', 'url': QUEUE_URL, 'entries': parse_queue(data), 'error': ''}
    except Exception as exc:  # noqa: BLE001 - network, 404, and bad JSON all fall back
        error = str(exc)
    return {
        'source': 'local',
        'url': QUEUE_URL,
        'entries': read_local_queue(),
        'error': error,
    }


def sync_queue(job_id: str) -> None:
    try:
        queue = fetch_queue()
        library = _list_riffs(summaries=False)
        pending = pending_entries(queue['entries'], library)
        total = len(pending)
        label = 'GitHub' if queue['source'] == 'github' else 'the queue file in this repo'
        if total == 0:
            _job(job_id, status='done', step=f'Library is up to date ({label})',
                 done=0, total=0, source=queue['source'], riffs=_list_riffs(summaries=True))
            return
        added = 0
        skipped = 0
        for index, entry in enumerate(pending):
            name = entry.get('title') or entry['url']
            _job(job_id, status='syncing', step=f'{index + 1} of {total} — {name}',
                 done=index, total=total, source=queue['source'], current=name)
            child = f'{job_id}-{index}'
            import_url(entry['url'], child, title=entry.get('title') or '', notes=entry.get('notes') or '')
            with LOCK:
                outcome = JOBS.get(child) or {}
            if outcome.get('skipped'):
                skipped += 1
            elif outcome.get('status') == 'done':
                added += 1
        if added:
            step = f'Added {added} from {label}'
            if skipped:
                step += f', {skipped} already saved'
        elif skipped:
            step = f'Already in the library ({label})'
        else:
            step = f'Nothing new from {label}'
        _job(job_id, status='done', step=step,
             done=total, total=total, source=queue['source'], riffs=_list_riffs(summaries=True))
    except Exception as exc:  # noqa: BLE001
        _job(job_id, status='error', step='Sync failed', error=str(exc))
        traceback.print_exc()


def _read_riff(riff_id: str) -> dict | None:
    path = LIBRARY / _slug(riff_id) / 'riff.json'
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _write_riff(riff_id: str, patch: dict) -> dict | None:
    folder = LIBRARY / _slug(riff_id)
    path = folder / 'riff.json'
    if not path.exists():
        return None
    record = json.loads(path.read_text())
    allowed = (
        'title', 'uploader', 'bpm', 'key', 'notes', 'alphatex',
        'downbeatOffset', 'loopA', 'loopB', 'speed', 'loopClip',
    )
    for key in allowed:
        if key in patch:
            record[key] = patch[key]
    if 'speed' in patch:
        try:
            record['speed'] = min(1, max(0.5, float(patch['speed'])))
        except (TypeError, ValueError):
            record['speed'] = 1
    if 'bpm' in patch:
        record['bpmSource'] = 'manual'
    if 'key' in patch:
        record['keySource'] = 'manual'
    if 'alphatex' in patch:
        (folder / 'tab.alphatex').write_text(patch['alphatex'])
    path.write_text(json.dumps(record, indent=2))
    return record


def _parse_multipart(body: bytes, content_type: str) -> dict:
    match = re.search(r'boundary=([^;]+)', content_type or '')
    if not match:
        raise ValueError('Expected a multipart upload.')
    boundary = match.group(1).strip().strip('"').encode()
    parts = body.split(b'--' + boundary)
    fields: dict = {}
    for part in parts:
        if b'\r\n\r\n' not in part:
            continue
        head, data = part.split(b'\r\n\r\n', 1)
        data = data.rstrip(b'\r\n')
        if data.endswith(b'--'):
            data = data[:-2].rstrip(b'\r\n')
        header = head.decode('utf-8', 'replace')
        name_match = re.search(r'name="([^"]+)"', header)
        if not name_match:
            continue
        name = name_match.group(1)
        file_match = re.search(r'filename="([^"]*)"', header)
        if file_match:
            fields[name] = {'filename': file_match.group(1), 'data': data}
        else:
            fields[name] = data.decode('utf-8', 'replace')
    return fields


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt: str, *args) -> None:
        print(f'[riff] {self.address_string()} {fmt % args}')

    def _json(self, code: int, payload) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def _read_body(self) -> bytes:
        length = int(self.headers.get('Content-Length') or 0)
        if length > 250_000_000:
            raise ValueError('File is too large.')
        return self.rfile.read(length) if length else b''

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == '/api/health':
            self._json(200, health())
            return
        if path == '/api/riffs':
            self._json(200, {'riffs': _list_riffs(summaries=True)})
            return
        if path == '/api/queue':
            queue = fetch_queue()
            library = _list_riffs(summaries=False)
            self._json(200, {
                'source': queue['source'],
                'url': queue['url'],
                'error': queue['error'],
                'entries': queue['entries'],
                'pending': [entry['url'] for entry in pending_entries(queue['entries'], library)],
            })
            return
        if path.startswith('/api/jobs/'):
            job_id = path.rsplit('/', 1)[-1]
            with LOCK:
                job = JOBS.get(job_id)
            if not job:
                self._json(404, {'error': 'Unknown job'})
                return
            self._json(200, job)
            return
        if path.startswith('/api/riffs/'):
            record = _read_riff(unquote(path.split('/')[3]))
            if not record:
                self._json(404, {'error': 'No riff with that id'})
                return
            folder = LIBRARY / _slug(record.get('id') or '')
            self._json(200, _decorate(record, folder) if folder.is_dir() else record)
            return
        if path.startswith('/media/'):
            self._media(path)
            return
        self._json(404, {'error': 'Not found'})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == '/api/queue/sync':
                job_id = uuid.uuid4().hex[:12]
                _job(job_id, status='queued', step='Checking the song queue', done=0, total=0)
                threading.Thread(target=sync_queue, args=(job_id,), daemon=True).start()
                self._json(202, {'jobId': job_id})
                return
            if path == '/api/riffs/import':
                payload = json.loads(self._read_body().decode() or '{}')
                url = _validate_url(payload.get('url') or '')
                job_id = uuid.uuid4().hex[:12]
                _job(job_id, status='queued', step='Starting', url=url)
                threading.Thread(target=import_url, args=(url, job_id), daemon=True).start()
                self._json(202, {'jobId': job_id})
                return
            if path == '/api/riffs/upload':
                fields = _parse_multipart(self._read_body(), self.headers.get('Content-Type') or '')
                upload = fields.get('file')
                if not isinstance(upload, dict) or not upload.get('data'):
                    raise ValueError('Choose a video file.')
                job_id = uuid.uuid4().hex[:12]
                tmp = LIBRARY / f'.upload-{job_id}'
                tmp.mkdir(parents=True, exist_ok=True)
                src = tmp / (_slug(upload.get('filename') or 'upload') + '.mp4')
                src.write_bytes(upload['data'])
                meta = {
                    'title': fields.get('title') or upload.get('filename') or 'Imported video',
                    'description': fields.get('description') or '',
                    'uploader': fields.get('uploader') or '',
                    'sourceUrl': fields.get('sourceUrl') or '',
                    'id': fields.get('id') or '',
                    'titleOverride': fields.get('title') or '',
                }
                _job(job_id, status='queued', step='Starting')
                threading.Thread(target=import_file, args=(src, meta, job_id), daemon=True).start()
                self._json(202, {'jobId': job_id})
                return
        except ValueError as exc:
            self._json(400, {'error': str(exc)})
            return
        except Exception as exc:  # noqa: BLE001
            self._json(500, {'error': str(exc)})
            return
        self._json(404, {'error': 'Not found'})

    def do_PUT(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not path.startswith('/api/riffs/'):
            self._json(404, {'error': 'Not found'})
            return
        try:
            patch = json.loads(self._read_body().decode() or '{}')
        except json.JSONDecodeError:
            self._json(400, {'error': 'Bad JSON'})
            return
        record = _write_riff(unquote(path.split('/')[3]), patch)
        if not record:
            self._json(404, {'error': 'No riff with that id'})
            return
        self._json(200, record)

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not path.startswith('/api/riffs/'):
            self._json(404, {'error': 'Not found'})
            return
        folder = LIBRARY / _slug(unquote(path.split('/')[3]))
        if not folder.exists():
            self._json(404, {'error': 'No riff with that id'})
            return
        shutil.rmtree(folder)
        self._json(200, {'ok': True})

    def _media(self, path: str) -> None:
        rel = unquote(path[len('/media/'):])
        file_path = (LIBRARY / rel).resolve()
        if LIBRARY.resolve() not in file_path.parents or not file_path.is_file():
            self._json(404, {'error': 'Missing file'})
            return
        size = file_path.stat().st_size
        ctype = 'video/mp4' if file_path.suffix == '.mp4' else 'image/jpeg'
        range_header = self.headers.get('Range')
        start, end = 0, size - 1
        status = 200
        if range_header and range_header.startswith('bytes='):
            spec = range_header.split('=', 1)[1].split('-', 1)
            if spec[0]:
                start = int(spec[0])
            if len(spec) > 1 and spec[1]:
                end = int(spec[1])
            end = min(end, size - 1)
            if start > end or start >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                return
            status = 206
        length = end - start + 1
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        with file_path.open('rb') as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                chunk = handle.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


def main() -> None:
    LIBRARY.mkdir(parents=True, exist_ok=True)
    missing = [name for name in ('ffmpeg', 'ffprobe') if not _which(name)]
    if missing:
        print('[riff] missing tools:', ', '.join(missing), '— brew install ffmpeg yt-dlp')
    if not _which('yt-dlp'):
        print('[riff] yt-dlp not found — link import will fail until it is installed. File import still works.')
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'[riff] helper on http://{HOST}:{PORT}')
    server.serve_forever()


if __name__ == '__main__':
    main()
