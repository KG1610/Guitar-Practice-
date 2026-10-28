"""The committed link queue (`riffs.json`) and which of those songs are already local."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

QUEUE_FILE = Path(__file__).resolve().parents[1] / 'riffs.json'


def normalize_url(url: str) -> str:
    """Host + path, without scheme, www, query, or a trailing slash.

    Share links and reel links stay different here. The video id caught after
    yt-dlp resolves a link is what collapses those two.
    """
    parsed = urlparse((url or '').strip())
    host = (parsed.hostname or '').lower()
    if host.startswith('www.'):
        host = host[4:]
    path = (parsed.path or '').rstrip('/')
    return f'{host}{path}'


def parse_queue(data) -> list[dict]:
    """Accept `{ "riffs": [ ... ] }` or a bare array."""
    if isinstance(data, list):
        raw = data
    elif isinstance(data, dict):
        raw = data.get('riffs') or data.get('queue') or []
    else:
        return []
    entries = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        url = str(item.get('url') or '').strip()
        if not url:
            continue
        entries.append({
            'url': url,
            'title': str(item.get('title') or '').strip(),
            'notes': str(item.get('notes') or '').strip(),
            'added': str(item.get('added') or item.get('addedAt') or '').strip(),
        })
    return entries


def read_local_queue(path: Path | None = None) -> list[dict]:
    file = path or QUEUE_FILE
    if not file.is_file():
        return []
    try:
        return parse_queue(json.loads(file.read_text()))
    except (OSError, json.JSONDecodeError):
        return []


def known_keys(records: list[dict]) -> set[str]:
    keys = set()
    for record in records:
        for url in [record.get('sourceUrl'), *(record.get('sourceUrls') or [])]:
            if url:
                keys.add(normalize_url(url))
        video_id = record.get('videoId') or record.get('id')
        if video_id:
            keys.add(f'id:{video_id}')
    return keys


def pending_entries(entries: list[dict], records: list[dict]) -> list[dict]:
    """Queue rows whose URL and video id are not already in the local library."""
    known = known_keys(records)
    pending = []
    seen = set()
    for entry in entries:
        key = normalize_url(entry['url'])
        if not key or key in known or key in seen:
            continue
        seen.add(key)
        pending.append(entry)
    return pending
