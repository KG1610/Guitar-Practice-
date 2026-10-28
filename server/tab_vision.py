"""Read a scrolling Guitar Pro tab burned into a vertical practice reel.

The overlay on these clips is a white card: standard notation on top, a 6-line
tab underneath, and a pale yellow wash on the current bar. The card stays put
and the music scrolls sideways in jumps. We stitch the stable views into one
tab, read fret numbers off the strings, and use the yellow bar as a clock.
"""

from __future__ import annotations

import os
import subprocess
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from server.music import beats_to_alphatex, quantize_quarters

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/croscore/Arimo-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Verdana.ttf',
    '/Library/Fonts/Arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
]


def _run(cmd: list[str]) -> bytes:
    return subprocess.check_output(cmd, stderr=subprocess.DEVNULL)


def grab_frame(video: str, t: float, crop: tuple[int, int, int, int] | None = None) -> np.ndarray:
    vf = []
    if crop:
        x, y, w, h = crop
        vf.append(f'crop={w}:{h}:{x}:{y}')
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', video, '-frames:v', '1']
    if vf:
        cmd += ['-vf', ','.join(vf)]
    cmd += ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = _run(cmd)
    if crop:
        _, _, w, h = crop
    else:
        # Probe once would be cleaner; callers that need full frames pass crop.
        raise ValueError('crop required')
    frame = np.frombuffer(raw, dtype=np.uint8)
    if frame.size != w * h * 3:
        raise RuntimeError(f'unexpected frame size {frame.size} for {w}x{h}')
    return frame.reshape(h, w, 3).copy()


def probe_size(video: str) -> tuple[int, int, float]:
    out = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration',
        '-of', 'csv=p=0', video,
    ], text=True).strip().split(',')
    # csv may be width,height,duration or with extra fields
    nums = [float(x) for x in out if x]
    w, h = int(nums[0]), int(nums[1])
    dur = nums[2] if len(nums) > 2 else 0.0
    if not dur:
        dur_s = subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1', video,
        ], text=True).strip()
        dur = float(dur_s or 0)
    return w, h, dur


def _line_score(gray: np.ndarray) -> np.ndarray:
    h = gray.shape[0]
    score = np.zeros(h, np.float32)
    # A staff line is a local vertical darkening that runs across the row.
    above = gray[:-4].astype(np.int16)
    below = gray[4:].astype(np.int16)
    mid = gray[2:-2].astype(np.int16)
    dark = (mid < above - 18) & (mid < below - 18) & (mid < 210)
    score[2:-2] = dark.mean(axis=1)
    return score


def _peaks(score: np.ndarray, min_score: float, min_gap: int) -> list[int]:
    order = np.argsort(score)[::-1]
    found = []
    for y in order:
        if score[y] < min_score:
            break
        if any(abs(int(y) - p) < min_gap for p in found):
            continue
        found.append(int(y))
    found.sort()
    return found


def _group_staves(peaks: list[int]) -> list[list[int]]:
    if not peaks:
        return []
    groups = [[peaks[0]]]
    for y in peaks[1:]:
        if y - groups[-1][-1] < 48:
            groups[-1].append(y)
        else:
            groups.append([y])
    return groups


def _evenly_spaced(group: list[int], count: int, spacing: tuple[float, float]) -> list[int] | None:
    if len(group) < count:
        return None
    best = None
    for i in range(len(group) - count + 1):
        window = group[i:i + count]
        gaps = np.diff(window)
        if gaps.min() < spacing[0] or gaps.max() > spacing[1]:
            continue
        if gaps.max() - gaps.min() > 8:
            continue
        score = float(gaps.std())
        if best is None or score < best[0]:
            best = (score, window)
    return best[1] if best else None


def detect_staves(gray: np.ndarray) -> dict | None:
    score = _line_score(gray)
    peaks = _peaks(score, 0.35, 6)
    groups = _group_staves(peaks)
    notation = None
    tab = None
    for group in groups:
        tab_try = _evenly_spaced(group, 6, (12, 32))
        if tab_try and (tab is None or tab_try[0] > tab[0]):
            tab = tab_try
        note_try = _evenly_spaced(group, 5, (8, 22))
        if note_try and (notation is None or note_try[0] < (tab[0] if tab else 10**9)):
            # Prefer a 5-line staff that sits above the tab.
            notation = note_try
    if not tab:
        return None
    if notation and notation[0] > tab[0]:
        notation = None
    return {'tab': tab, 'notation': notation, 'score': score}


def detect_crop(video: str) -> tuple[int, int, int, int]:
    """Return x, y, w, h covering notation + tab. Falls back to the top band."""
    w, h, _ = probe_size(video)
    # One mid frame is enough: the card does not move.
    cmd = ['ffmpeg', '-v', 'error', '-ss', '1.0', '-i', video, '-frames:v', '1',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = _run(cmd)
    frame = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3)
    gray = frame.mean(axis=2)
    staves = detect_staves(gray)
    if not staves:
        # Top portion of a vertical reel.
        band_h = min(h, max(460, int(h * 0.28)))
        return 0, 0, w, band_h
    tab = staves['tab']
    notation = staves['notation']
    top = (notation[0] - 55) if notation else (tab[0] - 180)
    bottom = tab[-1] + 28
    top = max(0, int(top))
    bottom = min(h, int(bottom))
    # Even sizes: yuv420 crops otherwise get a row shaved off and the raw
    # reader loses sync.
    ch = max(80, bottom - top)
    ch -= ch % 2
    cw = w - (w % 2)
    return 0, top, cw, ch


def _yellow_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    return (r > 180) & (g > 170) & (b > 110) & (((r + g) // 2) > b + 14) & (np.abs(r - g) < 48)


def _ink_projection(gray: np.ndarray) -> np.ndarray:
    return (gray < 110).mean(axis=0).astype(np.float32)


def shift_1d(a: np.ndarray, b: np.ndarray) -> int:
    """How far b's content sits to the right of a's, in pixels.

    b[x] corresponds to a[x + shift] when the score has scrolled left.
    """
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    a = a - a.mean()
    b = b - b.mean()
    n = int(2 ** np.ceil(np.log2(len(a) + len(b))))
    cross = np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n))
    cross /= np.abs(cross) + 1e-9
    corr = np.fft.irfft(cross, n)
    i = int(np.argmax(corr))
    if i > n // 2:
        i -= n
    return i


def _barline_xs(gray: np.ndarray, y0: int, y1: int) -> list[int]:
    band = gray[y0:y1]
    if band.size == 0:
        return []
    dark = band < 85
    col = dark.mean(axis=0)
    xs = np.where(col > 0.45)[0]
    if len(xs) == 0:
        return []
    groups = []
    start = prev = int(xs[0])
    for x in xs[1:]:
        x = int(x)
        if x > prev + 4:
            groups.append((start + prev) // 2)
            start = x
        prev = x
    groups.append((start + prev) // 2)
    return groups


def scan_motion(video: str, crop: tuple[int, int, int, int], fps: float = 8.0) -> list[dict]:
    x, y, w, h = crop
    cmd = [
        'ffmpeg', '-v', 'error', '-i', video,
        '-vf', f'crop={w}:{h}:{x}:{y},fps={fps}',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    frames = []
    index = 0
    assert proc.stdout is not None
    nbytes = w * h * 3
    while True:
        buf = proc.stdout.read(nbytes)
        if len(buf) < nbytes:
            break
        rgb = np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
        gray = rgb.mean(axis=2)
        yellow = _yellow_mask(rgb)
        # Restrict the wash to the lower half of the card (the tab), so a
        # pale caption elsewhere does not look like the playhead.
        band = yellow[int(h * 0.45): int(h * 0.92)]
        col = band.mean(axis=0)
        on = np.where(col > 0.28)[0]
        if len(on):
            yx0, yx1 = int(on.min()), int(on.max())
        else:
            yx0 = yx1 = -1
        frames.append({
            't': index / fps,
            'proj': _ink_projection(gray),
            'yellow': (yx0, yx1),
            'barlines': _barline_xs(gray, int(h * 0.45), h - 2),
        })
        index += 1
    proc.wait()
    return frames


def segment_views(frames: list[dict], jump: int = 14) -> list[list[dict]]:
    views: list[list[dict]] = []
    current: list[dict] = []
    prev = None
    for frame in frames:
        if prev is not None:
            dx = shift_1d(prev, frame['proj'])
            frame['dx'] = dx
            if abs(dx) > jump:
                if len(current) >= 2:
                    views.append(current)
                current = []
                prev = frame['proj']
                continue
        else:
            frame['dx'] = 0
        current.append(frame)
        prev = frame['proj']
    if len(current) >= 2:
        views.append(current)
    return views


def _whiten_yellow(rgb: np.ndarray) -> np.ndarray:
    out = rgb.copy()
    yellow = _yellow_mask(out)
    gray = out.mean(axis=2)
    wipe = yellow & (gray > 140)
    out[wipe] = 246
    return out


def composite_view(video: str, crop: tuple[int, int, int, int], times: list[float]) -> np.ndarray:
    frames = [_whiten_yellow(grab_frame(video, t, crop)) for t in times]
    stack = np.stack(frames, axis=0)
    return np.median(stack, axis=0).astype(np.uint8)


def _orb_shift(a_rgb: np.ndarray, b_rgb: np.ndarray) -> tuple[float, float, int] | None:
    """Pixel shift of matching landmarks. b[x] lines up with a[x + dx]."""
    try:
        import cv2
    except ImportError:
        return None
    def gray(image):
        if image.ndim == 2:
            return image
        return cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    ga, gb = gray(a_rgb), gray(b_rgb)
    orb = cv2.ORB_create(nfeatures=2500)
    k1, d1 = orb.detectAndCompute(ga, None)
    k2, d2 = orb.detectAndCompute(gb, None)
    if d1 is None or d2 is None or len(d1) < 8 or len(d2) < 8:
        return None
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(d1, d2, k=2)
    dxs = []
    dys = []
    for pair in pairs:
        if len(pair) < 2:
            continue
        first, second = pair
        if first.distance < 0.85 * second.distance:
            dxs.append(k1[first.queryIdx].pt[0] - k2[first.trainIdx].pt[0])
            dys.append(k1[first.queryIdx].pt[1] - k2[first.trainIdx].pt[1])
    if len(dxs) < 8:
        return None
    dxs = np.asarray(dxs)
    dys = np.asarray(dys)
    bins = np.round(dxs / 6.0) * 6.0
    values, counts = np.unique(bins, return_counts=True)
    order = np.argsort(counts)[::-1]
    best = int(order[0])
    if counts[best] < 10:
        return None
    sel = np.abs(dxs - values[best]) < 10
    if int(sel.sum()) < 10:
        return None
    return float(np.median(dxs[sel])), float(np.median(dys[sel])), int(sel.sum())


def stitch_views(images: list[np.ndarray]) -> tuple[np.ndarray, list[int]]:
    if not images:
        raise ValueError('no views to stitch')
    origins = [0]
    for i in range(1, len(images)):
        found = _orb_shift(images[i - 1], images[i])
        if found is None:
            # Couldn't lock the scroll. Park this view to the right of the
            # previous one instead of smearing a bad overlap.
            origins.append(origins[-1] + images[i - 1].shape[1] + 28)
            print(f'[riff] view {i} did not lock onto the previous one; leaving a gap', flush=True)
            continue
        dx, dy, votes = found
        if abs(dy) > 3:
            print(f'[riff] view {i} vertical drift {dy:.1f}px', flush=True)
        origins.append(origins[-1] + int(round(dx)))
        print(f'[riff] view {i} shift {dx:.0f}px ({votes} matches)', flush=True)
    min_o = min(origins)
    origins = [o - min_o for o in origins]
    h = max(im.shape[0] for im in images)
    width = max(o + im.shape[1] for o, im in zip(origins, images))
    width = min(width, 20000)
    canvas = np.full((h, width, 3), 246, np.uint8)
    filled = np.zeros(width, bool)
    for origin, image in zip(origins, images):
        w = image.shape[1]
        x0 = max(0, origin)
        x1 = min(width, origin + w)
        if x1 <= x0:
            continue
        src = image[:, x0 - origin:x0 - origin + (x1 - x0)]
        if src.ndim == 2:
            src = np.repeat(src[:, :, None], 3, axis=2)
        # Keep the first clean view in the overlap so a 1px disagreement
        # doesn't double every fret number. Only the newly revealed columns
        # come from the incoming view.
        fresh = ~filled[x0:x1]
        if fresh.any():
            canvas[:, x0:x1][:, fresh] = src[:, fresh]
        filled[x0:x1] = True
    return canvas, origins


def _find_font() -> str | None:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    try:
        found = subprocess.check_output(['fc-match', '-f', '%{file}', 'sans'], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    return found or None


_TEMPLATE_CACHE: dict = {}


def _templates(font_path: str) -> list[tuple[str, np.ndarray]]:
    key = font_path
    if key in _TEMPLATE_CACHE:
        return _TEMPLATE_CACHE[key]
    chars = list('0123456789') + ['full', '1/2', '1 1/2', 'sl.', 'sl', 'P.M.', 'PM', 'H', 'P', '3']
    out = []
    for size in (15, 18, 22, 28):
        font = ImageFont.truetype(font_path, size)
        for ch in chars:
            img = Image.new('L', (160, 48), 255)
            draw = ImageDraw.Draw(img)
            draw.text((2, 2), ch, font=font, fill=0)
            arr = np.array(img) < 140
            ys, xs = np.where(arr)
            if len(xs) == 0:
                continue
            glyph = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            out.append((ch, glyph))
    _TEMPLATE_CACHE[key] = out
    return out


def _ncc(glyph: np.ndarray, template: np.ndarray) -> float:
    if glyph.size == 0 or template.size == 0:
        return -1.0
    thumb = np.array(Image.fromarray(template.astype(np.uint8) * 255).resize(
        (glyph.shape[1], glyph.shape[0]), Image.Resampling.BILINEAR,
    )).astype(np.float32) / 255.0
    aa = glyph.astype(np.float32)
    if aa.std() < 1e-3 or thumb.std() < 1e-3:
        return -1.0
    aa = (aa - aa.mean()) / aa.std()
    bb = (thumb - thumb.mean()) / thumb.std()
    return float((aa * bb).mean())


def _holes(glyph: np.ndarray) -> int:
    h, w = glyph.shape
    inv = np.pad(~glyph, 1, constant_values=True)
    seen = np.zeros_like(inv)
    q = deque()
    hh, ww = inv.shape
    for x in range(ww):
        for y in (0, hh - 1):
            if inv[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(hh):
        for x in (0, ww - 1):
            if inv[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < hh and 0 <= nx < ww and inv[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    # Unreached background cells inside the padded image are holes.
    holes = 0
    hole_seen = np.zeros_like(inv)
    for y in range(hh):
        for x in range(ww):
            if inv[y, x] and not seen[y, x] and not hole_seen[y, x]:
                holes += 1
                dq = deque([(y, x)])
                hole_seen[y, x] = True
                while dq:
                    cy, cx = dq.popleft()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < hh and 0 <= nx < ww and inv[ny, nx] and not seen[ny, nx] and not hole_seen[ny, nx]:
                            hole_seen[ny, nx] = True
                            dq.append((ny, nx))
    return holes


def _components(mask: np.ndarray, min_area: int = 8) -> list[dict]:
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    comps = []
    cid = 0
    ys, xs = np.where(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if labels[y, x]:
            continue
        cid += 1
        q = deque([(y, x)])
        labels[y, x] = cid
        minx = maxx = x
        miny = maxy = y
        area = 0
        while q:
            cy, cx = q.popleft()
            area += 1
            if cx < minx:
                minx = cx
            elif cx > maxx:
                maxx = cx
            if cy < miny:
                miny = cy
            elif cy > maxy:
                maxy = cy
            for ny in (cy - 1, cy, cy + 1):
                if ny < 0 or ny >= h:
                    continue
                row = mask[ny]
                lab = labels[ny]
                for nx in (cx - 1, cx, cx + 1):
                    if nx < 0 or nx >= w or not row[nx] or lab[nx]:
                        continue
                    lab[nx] = cid
                    q.append((ny, nx))
        if area >= min_area:
            comps.append({
                'area': area,
                'x0': minx, 'x1': maxx, 'y0': miny, 'y1': maxy,
                'w': maxx - minx + 1, 'h': maxy - miny + 1,
            })
    return comps


def _strip_staff(gray: np.ndarray, lines: list[int], run: int = 26) -> np.ndarray:
    """Remove long horizontal staff runs, keeping the short strokes of digits."""
    out = gray.copy()
    h, w = out.shape
    for y in lines:
        for dy in (-1, 0, 1):
            yy = y + dy
            if yy < 0 or yy >= h:
                continue
            dark = out[yy] < 205
            if w < run:
                continue
            c = np.cumsum(dark.astype(np.int16))
            window = c[run - 1:] - np.concatenate([[0], c[:-run]])
            long = np.zeros(w, bool)
            idx = np.where(window >= run - 1)[0]
            for i in idx.tolist():
                long[i:i + run] = True
            row = out[yy]
            row[long & (row > 60)] = 246
            out[yy] = row
    return out


def _classify_digit(glyph: np.ndarray, templates: list[tuple[str, np.ndarray]]) -> tuple[str, float]:
    best = (-1.0, '?')
    second = -1.0
    holes = _holes(glyph)
    for ch, tmpl in templates:
        if len(ch) != 1 or not ch.isdigit():
            continue
        score = _ncc(glyph, tmpl)
        # A closed 8 has two holes; don't let a noisy 0/9 steal it, and don't
        # call an open 7 an 8.
        if ch == '8' and holes < 2:
            score -= 0.08
        if ch in '069' and holes < 1:
            score -= 0.05
        if ch in '17235' and holes >= 2:
            score -= 0.08
        if score > best[0]:
            second = best[0]
            best = (score, ch)
        elif score > second:
            second = score
    return best[1], best[0]


def _match_word(crop: np.ndarray, templates: list[tuple[str, np.ndarray]], words: list[str]) -> tuple[str, float]:
    if crop.size == 0 or crop.shape[0] < 4 or crop.shape[1] < 4:
        return '', -1.0
    glyph = crop < 120
    if glyph.mean() < 0.02 or glyph.mean() > 0.7:
        return '', -1.0
    ys, xs = np.where(glyph)
    if len(xs) == 0:
        return '', -1.0
    glyph = glyph[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    best = ('', -1.0)
    for ch, tmpl in templates:
        if ch not in words:
            continue
        score = _ncc(glyph, tmpl)
        if score > best[1]:
            best = (ch, score)
    return best


def read_score(image: np.ndarray, bpm_hint: float | None = None) -> dict:
    """Read tab notes from a stitched (or single) RGB card."""
    gray = image.mean(axis=2)
    staves = detect_staves(gray)
    warnings = []
    if not staves:
        return {
            'alphatex': '',
            'notes': [],
            'bars': [],
            'barlines': [],
            'warnings': ['No 6-line tab staff found on this clip.'],
            'scoreBpm': None,
            'debug': None,
        }
    tab_lines = staves['tab']
    notation = staves['notation']
    spacing = float(np.median(np.diff(tab_lines)))
    cleaned = _strip_staff(gray, tab_lines)
    y0 = max(0, tab_lines[0] - int(spacing * 0.55))
    y1 = min(cleaned.shape[0], tab_lines[-1] + int(spacing * 0.55))
    band = cleaned[y0:y1] < 115
    raw_comps = _merge_split_glyphs(_components(band, min_area=8))
    barlines = _barline_xs(gray, tab_lines[0], tab_lines[-1] + 1)
    # Drop barlines that sit on top of each other (final double bar).
    merged = []
    for x in barlines:
        if merged and x - merged[-1] < 16:
            continue
        merged.append(x)
    barlines = merged

    font_path = _find_font()
    templates = _templates(font_path) if font_path else []
    if not templates:
        warnings.append('No sans-serif font found for digit matching; tab numbers may be blank.')

    digits = []
    for comp in raw_comps:
        if comp['h'] > spacing * 1.35 or comp['w'] > spacing * 1.6:
            continue
        if comp['h'] < spacing * 0.45 or comp['w'] < 3:
            continue
        # Left of the first barline is the TAB clef, not a fret.
        if barlines and comp['x1'] < barlines[0] - 4:
            continue
        glyph = band[comp['y0']:comp['y1'] + 1, comp['x0']:comp['x1'] + 1]
        cy = y0 + (comp['y0'] + comp['y1']) / 2
        box = {
            'x': (comp['x0'] + comp['x1']) / 2,
            'y': cy,
            'x0': comp['x0'], 'x1': comp['x1'],
            'y0': y0 + comp['y0'], 'y1': y0 + comp['y1'],
            'h': comp['h'], 'w': comp['w'],
        }
        # Narrow strokes are either the digit 1 (Guitar Pro draws it as a
        # stick) or a parenthesis. Decided once the other digits exist.
        if comp['w'] <= 6 and comp['h'] >= spacing * 0.5:
            box['kind'] = 'stroke'
            # A printed 1 has a top flag on the left, so the stem sits to the
            # right of the top. A parenthesis bulges the other way.
            box['stem'] = _stem_shift(glyph)
            digits.append(box)
            continue
        if not templates:
            continue
        ch, score = _classify_digit(glyph, templates)
        if score < 0.64 or not ch.isdigit():
            continue
        box.update({'kind': 'digit', 'ch': ch, 'score': score, 'low': score < 0.68})
        digits.append(box)
    _resolve_strokes(digits, spacing)

    # Group side-by-side digits (10, 12, 14) on the same string.
    # Bucket by string-ish row first so a "1" is seen before the digit it belongs to,
    # even when the stick's bounding box sits a pixel lower.
    digits.sort(key=lambda d: (round(d['y'] / max(6, spacing * 0.45)), d['x']))
    numbers = []
    used = set()
    digit_only = [d for d in digits if d['kind'] == 'digit']
    for i, dig in enumerate(digit_only):
        if i in used:
            continue
        group = [dig]
        used.add(i)
        for j in range(i + 1, len(digit_only)):
            other = digit_only[j]
            if j in used:
                continue
            if abs(other['y'] - dig['y']) > spacing * 0.45:
                continue
            gap = other['x0'] - group[-1]['x1']
            if -1 <= gap <= max(8, spacing * 0.5):
                group.append(other)
                used.add(j)
            elif other['x0'] > group[-1]['x1'] + spacing:
                break
        fret = int(''.join(g['ch'] for g in group))
        # A stick we called "1" that never joined a second digit is a parenthesis, not a fret.
        if fret == 1 and len(group) == 1 and group[0].get('score') == 0.8:
            continue
        if fret > 24:
            warnings.append(f'Ignored unlikely fret {fret}.')
            continue
        cx = sum(g['x'] for g in group) / len(group)
        cy = sum(g['y'] for g in group) / len(group)
        nearest = min(range(len(tab_lines)), key=lambda k: abs(tab_lines[k] - cy))
        if abs(tab_lines[nearest] - cy) > spacing * 0.55:
            continue
        # Parentheses hugging this number.
        paren = False
        for d in digits:
            if d['kind'] != 'paren':
                continue
            if abs(d['y'] - cy) > spacing * 0.5:
                continue
            if -2 <= d['x1'] - min(g['x0'] for g in group) <= 2 or abs(d['x'] - cx) < spacing:
                if d['x'] < cx and min(g['x0'] for g in group) - d['x1'] < 8:
                    paren = True
                if d['x'] > cx and d['x0'] - max(g['x1'] for g in group) < 8:
                    paren = True
        numbers.append({
            'fret': fret,
            'string': nearest + 1,
            'x': cx,
            'y': cy,
            'score': min(g['score'] for g in group),
            'low': any(g['low'] for g in group),
            'paren': paren,
            'x0': min(g['x0'] for g in group),
            'x1': max(g['x1'] for g in group),
        })

    # Technique text sits in the gap above the tab staff.
    _annotate_techniques(cleaned, tab_lines, notation, numbers, templates, warnings)

    bars, bar_beats = _group_bars(numbers, barlines, tab_lines, notation, cleaned, spacing, warnings)
    score_bpm = _read_tempo_mark(cleaned, notation, templates) if notation else None
    low = sum(1 for n in numbers if n.get('low'))
    if low:
        warnings.append(f'{low} fret number{"s" if low != 1 else ""} read with low confidence — check the highlighted ones in the editor.')
    if not numbers:
        warnings.append('Tab staff is there, but no fret numbers were read. The stitched image is still saved.')

    title_key = ''
    return {
        'notes': [
            {k: n[k] for k in ('fret', 'string', 'x', 'y', 'score', 'low', 'paren', 'bend', 'vibrato', 'slide', 'hammer', 'palm', 'letRing', 'tie') if k in n}
            for n in numbers
        ],
        'barlines': barlines,
        'bars': bars,
        'barBeats': bar_beats,
        'warnings': warnings,
        'scoreBpm': score_bpm,
        'tabLines': tab_lines,
        'notationLines': notation,
        'lowConfidence': low,
        'noteCount': len(numbers),
    }


def _region_word(gray: np.ndarray, x0: int, x1: int, y0: int, y1: int,
                 templates, words: list[str], threshold: float) -> str:
    x0 = max(0, int(x0))
    x1 = min(gray.shape[1], int(x1))
    y0 = max(0, int(y0))
    y1 = min(gray.shape[0], int(y1))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return ''
    word, score = _match_word(gray[y0:y1, x0:x1], templates, words)
    if score >= threshold:
        return word
    return ''


def _stem_shift(glyph: np.ndarray) -> float:
    height = glyph.shape[0]
    if height < 4:
        return 0.0

    def center(rows: np.ndarray) -> float | None:
        cols = np.where(rows.any(axis=0))[0]
        if len(cols) == 0:
            return None
        return float(cols.mean())

    top = center(glyph[:max(1, height // 3)])
    mid = center(glyph[height // 3: 2 * height // 3] if height > 3 else glyph)
    if top is None or mid is None:
        return 0.0
    return mid - top


def _merge_split_glyphs(comps: list[dict]) -> list[dict]:
    """Staff-line removal can slice a fret in half. Glue the halves back together."""
    comps = [dict(c) for c in comps]
    changed = True
    while changed:
        changed = False
        comps.sort(key=lambda c: (c['x0'], c['y0']))
        merged = []
        used = set()
        for i, comp in enumerate(comps):
            if i in used:
                continue
            for j in range(i + 1, len(comps)):
                if j in used:
                    continue
                other = comps[j]
                if other['x0'] > comp['x1'] + 2:
                    break
                overlap = min(comp['x1'], other['x1']) - max(comp['x0'], other['x0'])
                narrow = min(comp['w'], other['w'])
                if overlap < max(2, narrow * 0.5):
                    continue
                gap = max(comp['y0'], other['y0']) - min(comp['y1'], other['y1'])
                if gap > 3:
                    continue
                used.add(j)
                comp = {
                    'x0': min(comp['x0'], other['x0']),
                    'x1': max(comp['x1'], other['x1']),
                    'y0': min(comp['y0'], other['y0']),
                    'y1': max(comp['y1'], other['y1']),
                    'area': comp['area'] + other['area'],
                }
                comp['w'] = comp['x1'] - comp['x0'] + 1
                comp['h'] = comp['y1'] - comp['y0'] + 1
                changed = True
            merged.append(comp)
        comps = merged
    return comps


def _resolve_strokes(digits: list[dict], spacing: float) -> None:
    """A thin stick just left of a fret is Guitar Pro's digit 1. A curve hugging a fret is a parenthesis."""
    strokes = [d for d in digits if d.get('kind') == 'stroke']
    frets = [d for d in digits if d.get('kind') == 'digit']
    for stroke in strokes:
        right = [
            d for d in frets
            if 0 <= d['x0'] - stroke['x1'] <= max(8, spacing * 0.45)
            and abs(d['y'] - stroke['y']) <= spacing * 0.45
        ]
        right.sort(key=lambda d: d['x0'])
        neighbor = right[0] if right else None
        # The printed 1 is about as tall as the digit it belongs to.
        # Parentheses are a few pixels taller than the fret they wrap.
        # The digit 1 is the same height as its partner.
        if neighbor and stroke.get('stem', 0) > 0.6 and stroke['w'] >= 4 and stroke['h'] <= neighbor['h'] + 2:
            stroke['kind'] = 'digit'
            stroke['ch'] = '1'
            stroke['score'] = 0.8
            stroke['low'] = False
            frets.append(stroke)
    for stroke in strokes:
        if stroke.get('kind') != 'stroke':
            continue
        near = [
            d for d in frets
            if abs(d['y'] - stroke['y']) <= spacing * 0.55
            and (0 <= d['x0'] - stroke['x1'] <= 9 or 0 <= stroke['x0'] - d['x1'] <= 9)
        ]
        stroke['kind'] = 'paren' if near else 'ignore'


def _annotate_techniques(gray, tab_lines, notation, numbers, templates, warnings):
    if not numbers:
        return
    spacing = float(np.median(np.diff(tab_lines)))
    top = tab_lines[0]
    # Palm mute is a dashed line a little above the tab, not the notation beams.
    pm_span = _dashed_span(gray, int(top - spacing * 2.2), int(top - spacing * 0.35))
    if pm_span:
        for note in numbers:
            if pm_span[0] - 6 <= note['x'] <= pm_span[1] + 6:
                note['palm'] = True
    _mark_bends(gray, tab_lines, numbers)
    ordered = sorted(numbers, key=lambda n: n['x'])
    for a, b in zip(ordered, ordered[1:]):
        if b['x'] - a['x'] > spacing * 1.6:
            continue
        if a['fret'] == b['fret'] and a['string'] == b['string']:
            continue
        if abs(a['string'] - b['string']) > 1:
            continue
        if _diagonal_between(gray, a, b, tab_lines):
            a['slide'] = True
    _mark_vibrato(gray, tab_lines, numbers)
    if not any(n.get('bend') for n in numbers):
        warnings.append('Bend arrows were not locked to fret numbers. The tab image still shows them.')


def _dashed_span(gray: np.ndarray, y0: int, y1: int) -> tuple[int, int] | None:
    y0 = max(0, y0)
    y1 = min(gray.shape[0], y1)
    if y1 - y0 < 4:
        return None
    best = None
    for y in range(y0, y1):
        dark = gray[y] < 90
        # Count short runs (dashes), ignore a solid staff line.
        runs = []
        in_run = False
        start = 0
        for x, v in enumerate(dark.tolist()):
            if v and not in_run:
                in_run = True
                start = x
            elif not v and in_run:
                in_run = False
                runs.append((start, x - 1))
        if in_run:
            runs.append((start, len(dark) - 1))
        short = [r for r in runs if 3 <= r[1] - r[0] <= 22]
        if len(short) < 5:
            continue
        # Keep a chain of dashes. Isolated specks at the far left/right are not the line.
        chains = [[short[0]]]
        for run in short[1:]:
            if run[0] - chains[-1][-1][1] <= 40:
                chains[-1].append(run)
            else:
                chains.append([run])
        chain = max(chains, key=len)
        if len(chain) < 5:
            continue
        span = (chain[0][0], chain[-1][1])
        if best is None or (span[1] - span[0]) > (best[1] - best[0]):
            best = span
    return best


def _label_span(gray, y0, y1, templates, phrase: str) -> tuple[int, int] | None:
    """Find a text label by sliding a window. Used for 'let ring'."""
    if not templates:
        return None
    y0 = max(0, int(y0))
    y1 = min(gray.shape[0] - 1, int(y1))
    if y1 - y0 < 8:
        return None
    # Render once and scan columns coarsely.
    font_glyphs = [tmpl for ch, tmpl in templates if ch == 'P.M.']
    del font_glyphs
    step = 24
    w = gray.shape[1]
    hit = None
    for x in range(0, max(1, w - 80), step):
        word, score = _match_word(gray[y0:y1, x:x + 90], templates, [phrase] if False else [])
        del word, score
    # Dedicated render: look for the ink of the words by a simple brightness run
    # is too vague. Match a freshly rendered 'let ring' if the font templates
    # don't include the phrase (they don't). Build one here.
    return _scan_phrase(gray, y0, y1, phrase)


def _scan_phrase(gray: np.ndarray, y0: int, y1: int, phrase: str) -> tuple[int, int] | None:
    font_path = _find_font()
    if not font_path:
        return None
    font = ImageFont.truetype(font_path, 18)
    img = Image.new('L', (220, 40), 255)
    ImageDraw.Draw(img).text((2, 2), phrase, font=font, fill=0)
    tmpl = np.array(img) < 140
    ys, xs = np.where(tmpl)
    if len(xs) == 0:
        return None
    tmpl = tmpl[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    band = gray[y0:y1]
    if band.shape[0] < tmpl.shape[0] or band.shape[1] < tmpl.shape[1]:
        return None
    # Coarse normalised correlation via a shrunk strip.
    scale_h = tmpl.shape[0]
    best = (-1.0, 0)
    thumb_t = tmpl[::1, ::2]
    step = 8
    for x in range(0, band.shape[1] - thumb_t.shape[1], step):
        crop = band[:scale_h, x:x + tmpl.shape[1]:2]
        if crop.shape != thumb_t.shape:
            crop = np.array(Image.fromarray(band[:scale_h, x:x + tmpl.shape[1]]).resize(
                (thumb_t.shape[1], thumb_t.shape[0]), Image.Resampling.BILINEAR,
            ))
            ink = crop < 140
        else:
            ink = crop < 140
        score = _ncc(ink, thumb_t)
        if score > best[0]:
            best = (score, x)
    if best[0] < 0.38:
        return None
    return best[1], best[1] + tmpl.shape[1]


def _mark_bends(gray, tab_lines, numbers) -> None:
    """A bend is a tall narrow arrow rising off a fret, with 'full' or '1/2' beside it."""
    if not numbers:
        return
    spacing = float(np.median(np.diff(tab_lines)))
    top = int(tab_lines[0])
    y0 = max(0, int(top - spacing * 4.2))
    y1 = max(y0 + 4, int(top - 2))
    mask = gray[y0:y1] < 105
    for comp in _components(mask, min_area=20):
        if comp['h'] < spacing * 0.85 or comp['w'] > spacing * 2.0:
            continue
        if comp['h'] < comp['w'] * 0.9:
            continue
        cx = (comp['x0'] + comp['x1']) / 2
        text = gray[max(0, y0 + comp['y0'] - 16): y0 + comp['y0'] + 2, max(0, comp['x0'] - 6): comp['x1'] + 10]
        amount = 'full'
        if text.size:
            cols = np.where((text < 120).any(axis=0))[0]
            text_w = int(cols[-1] - cols[0]) if len(cols) > 1 else 0
            # "1/2" is a short label; "full" and "1 1/2" are wider.
            if 8 <= text_w <= 18:
                amount = 'half'
            elif text_w >= 28:
                amount = 'onehalf' if text_w < 34 else 'full'
        note = min(numbers, key=lambda n: abs(n['x'] - cx) + abs(n['y'] - top) * 0.15)
        if abs(note['x'] - cx) > spacing * 1.35:
            continue
        # Prefer the higher note of a double-stop; the arrow leaves that one.
        chord = [n for n in numbers if abs(n['x'] - note['x']) <= 8]
        note = min(chord, key=lambda n: n['string'])
        note['bend'] = amount
        note['bendRelease'] = True


def _diagonal_between(gray, a, b, tab_lines) -> bool:
    x0 = int(min(a['x'], b['x'])) + 2
    x1 = int(max(a['x'], b['x'])) - 2
    if x1 - x0 < 4:
        return False
    y_a = tab_lines[a['string'] - 1]
    y_b = tab_lines[b['string'] - 1]
    y0 = int(min(y_a, y_b) - 2)
    y1 = int(max(y_a, y_b) + 3)
    y0 = max(0, y0)
    y1 = min(gray.shape[0], y1)
    patch = gray[y0:y1, x0:x1]
    if patch.size == 0:
        return False
    ink = patch < 100
    if ink.mean() < 0.04:
        return False
    # A slide slash is not a horizontal staff remnant: ink should change row as x increases.
    rows = []
    for col in range(ink.shape[1]):
        ys = np.where(ink[:, col])[0]
        if len(ys):
            rows.append(float(ys.mean()))
    if len(rows) < 4:
        return False
    drift = rows[-1] - rows[0]
    return abs(drift) >= 2.5


def _mark_vibrato(gray, tab_lines, numbers):
    top = tab_lines[0]
    spacing = float(np.median(np.diff(tab_lines)))
    y0 = max(0, int(top - spacing * 3.2))
    y1 = int(top - 2)
    if y1 - y0 < 8:
        return
    band = gray[y0:y1] < 90
    comps = _components(band, min_area=20)
    for comp in comps:
        if comp['w'] < spacing * 1.4 or comp['h'] > spacing * 1.1:
            continue
        glyph = band[comp['y0']:comp['y1'] + 1, comp['x0']:comp['x1'] + 1]
        # Wiggles change direction along the top ink row.
        row = glyph.any(axis=0)
        if row.mean() < 0.4:
            continue
        # Count rises and falls of the top edge.
        tops = []
        for x in range(glyph.shape[1]):
            ys = np.where(glyph[:, x])[0]
            if len(ys):
                tops.append(int(ys.min()))
        if len(tops) < 8:
            continue
        turns = 0
        for i in range(2, len(tops)):
            d1 = tops[i - 1] - tops[i - 2]
            d2 = tops[i] - tops[i - 1]
            if d1 * d2 < 0:
                turns += 1
        if turns < 4:
            continue
        x0 = comp['x0']
        x1 = comp['x1']
        for note in numbers:
            if x0 - 4 <= note['x'] <= x1 + 4:
                note['vibrato'] = 'wide' if comp['h'] > spacing * 0.45 else True


def _beam_count(gray: np.ndarray, x: int, y0: int, y1: int, skip_ys: list[int] | None = None) -> int:
    x = int(x)
    h, w = gray.shape
    y0 = max(0, y0)
    y1 = min(h, y1)
    skip = skip_ys or []
    rows = []
    for y in range(y0, y1):
        if any(abs(y - s) <= 1 for s in skip):
            continue
        hit_row = False
        for dx in range(-6, 7):
            xx = x + dx
            if xx < 0 or xx >= w or gray[y, xx] > 80:
                continue
            left = xx
            while left > 0 and gray[y, left - 1] < 80:
                left -= 1
            right = xx
            while right < w - 1 and gray[y, right + 1] < 80:
                right += 1
            if right - left >= 16:
                hit_row = True
                break
        if hit_row:
            rows.append(y)
    if not rows:
        return 0
    beams = 1
    for a, b in zip(rows, rows[1:]):
        if b > a + 3:
            beams += 1
    return beams


def _triplet_marks(gray, notation, templates) -> list[tuple[int, int]]:
    """Return x-spans that are under a tuplet 3."""
    if not notation or not templates:
        return []
    y0 = max(0, notation[0] - 36)
    y1 = notation[-1] + 8
    band_gray = gray[y0:y1]
    mask = band_gray < 100
    comps = _components(mask, min_area=8)
    spans = []
    for comp in comps:
        if not (6 <= comp['h'] <= 18 and 4 <= comp['w'] <= 16):
            continue
        glyph = mask[comp['y0']:comp['y1'] + 1, comp['x0']:comp['x1'] + 1]
        ch, score = _classify_digit(glyph, templates)
        if ch != '3' or score < 0.6:
            continue
        cx = (comp['x0'] + comp['x1']) / 2
        # Bracket extent: walk left/right along nearby horizontal ink.
        y_mid = y0 + (comp['y0'] + comp['y1']) // 2
        left = int(cx)
        right = int(cx)
        for direction in (-1, 1):
            x = int(cx)
            while 0 <= x < gray.shape[1]:
                window = gray[max(0, y_mid - 14): y_mid + 14, x]
                if window.size and (window < 90).mean() > 0.15:
                    if direction < 0:
                        left = x
                    else:
                        right = x
                    x += direction
                    continue
                # Allow small gaps in the bracket.
                gap = gray[max(0, y_mid - 14): y_mid + 14, x:x + direction * 6:direction or 1]
                if gap.size and (gap < 90).mean() > 0.05:
                    x += direction * 4
                    continue
                break
        if right - left < 20:
            left = int(cx - 50)
            right = int(cx + 50)
        spans.append((left, right))
    return spans


def _group_bars(numbers, barlines, tab_lines, notation, gray, spacing, warnings):
    font_path = _find_font()
    templates = _templates(font_path) if font_path else []
    triplets = _triplet_marks(gray, notation, templates) if notation else []
    # Regions between barlines.
    edges = list(barlines)
    if len(edges) < 2:
        warnings.append('Barlines were hard to see, so the lick is one long bar and the rhythm is a best guess.')
        edges = [0, gray.shape[1] - 1]
    bars_out = []
    for i in range(len(edges) - 1):
        left, right = edges[i], edges[i + 1]
        if right - left < spacing * 2:
            continue
        group = [n for n in numbers if left + 2 <= n['x'] <= right - 2]
        group.sort(key=lambda n: n['x'])
        if group and len(group) <= 3 and all((n.get('score') or 0) < 0.72 for n in group):
            warnings.append(f'Bar {len(bars_out) + 1}: ignored {len(group)} low-confidence fret reading(s).')
            bars_out.append([])
            continue
        # Cluster into beats by x.
        beats_raw = []
        for note in group:
            if beats_raw and note['x'] - beats_raw[-1]['x'] <= max(8, spacing * 0.42):
                beats_raw[-1]['notes'].append(note)
                beats_raw[-1]['x'] = sum(n['x'] for n in beats_raw[-1]['notes']) / len(beats_raw[-1]['notes'])
            else:
                beats_raw.append({'x': note['x'], 'notes': [note]})
        note_y0 = (notation[0] - 30) if notation else 0
        note_y1 = (notation[-1] + 18) if notation else tab_lines[0]
        for beat in beats_raw:
            beams = _beam_count(gray, beat['x'], note_y0, note_y1, notation) if notation else 0
            beat['beams'] = beams
            beat['triplet'] = any(a <= beat['x'] <= b for a, b in triplets)
            if beat['triplet'] and beams <= 1:
                beat['quarters'] = 1 / 3
            elif beat['triplet'] and beams >= 2:
                beat['quarters'] = 1 / 6
            elif beams >= 3:
                beat['quarters'] = 0.125
            elif beams == 2:
                beat['quarters'] = 0.25
            elif beams == 1:
                beat['quarters'] = 0.5
            else:
                beat['quarters'] = None  # fill from x below
        # Fill unknown durations from x, then force the bar to sum to 4.
        width = float(right - left)
        known = [b for b in beats_raw if b['quarters']]
        if not beats_raw:
            bars_out.append([])
            continue
        if len(known) < len(beats_raw):
            # Proportional fallback for beats whose beams we couldn't see.
            xs = [b['x'] for b in beats_raw] + [right]
            for b, nxt in zip(beats_raw, xs[1:]):
                if b['quarters'] is None:
                    raw = max(0.1, (nxt - b['x']) / width * 4)
                    q, trip = quantize_quarters(raw)
                    b['quarters'] = q
                    b['triplet'] = b['triplet'] or trip
        total = sum(b['quarters'] for b in beats_raw)
        if total > 4.35 or total < 3.4:
            # Rescale onto 4/4 by re-quantizing proportional positions. Keeps
            # the editor honest when beam reading over-counts.
            warnings.append(
                f'Bar {len(bars_out) + 1}: rhythm symbols summed to {total:.2f} beats, so note spacing was used instead.'
            )
            positions = [(b['x'] - left) / width * 4 for b in beats_raw]
            tripletish = sum(1 for b in beats_raw if b.get('triplet')) >= max(2, len(beats_raw) // 2)
            grid = (1 / 3) if tripletish else (0.5 if len(beats_raw) <= 8 else 0.25)
            snapped = []
            last = -grid
            for pos in positions:
                point = round(pos / grid) * grid
                if point <= last + 1e-6:
                    point = last + grid
                snapped.append(min(point, max(grid, 4 - grid)))
                last = snapped[-1]
            ends = snapped[1:] + [4.0]
            for beat, start, end in zip(beats_raw, snapped, ends):
                raw = max(grid, end - start)
                if tripletish:
                    steps = max(1, int(round(raw / grid)))
                    beat['quarters'] = steps * grid
                    beat['triplet'] = True
                else:
                    q, _trip = quantize_quarters(max(0.25, raw))
                    beat['quarters'] = max(0.25, q)
                    beat['triplet'] = False
        # Ties from parentheses when the fret is held.
        for prev, beat in zip(beats_raw, beats_raw[1:]):
            for note in beat['notes']:
                if not note.get('paren'):
                    continue
                same = [n for n in prev['notes'] if n['string'] == note['string'] and n['fret'] == note['fret']]
                if same:
                    note['tie'] = True
        # A parenthesised note with no predecessor still gets played as written;
        # flag it so the editor isn't a surprise.
        emitted = []
        for beat in beats_raw:
            emitted.append({
                'quarters': beat['quarters'],
                'triplet': bool(beat.get('triplet')),
                'notes': beat['notes'],
            })
        bars_out.append(emitted)
    return bars_out, bars_out


def _read_tempo_mark(gray, notation, templates) -> float | None:
    if not notation or not templates:
        return None
    y1 = max(8, notation[0] - 2)
    y0 = max(0, y1 - 40)
    mask = gray[y0:y1] < 110
    comps = _components(mask, min_area=8)
    chars = []
    for comp in comps:
        if not (8 <= comp['h'] <= 28 and 3 <= comp['w'] <= 22):
            continue
        glyph = mask[comp['y0']:comp['y1'] + 1, comp['x0']:comp['x1'] + 1]
        ch, score = _classify_digit(glyph, templates)
        if score >= 0.6 and ch.isdigit():
            chars.append((comp['x0'], ch))
    if not chars:
        return None
    chars.sort()
    # Take the leftmost run of digits.
    number = chars[0][1]
    prev_x = chars[0][0]
    for x, ch in chars[1:]:
        if x - prev_x > 22:
            break
        number += ch
        prev_x = x
    try:
        value = float(number)
    except ValueError:
        return None
    if 40 <= value <= 240:
        return value
    return None


def _debug_image(image: np.ndarray, reading: dict) -> np.ndarray:
    rgb = image.copy()
    draw_base = rgb
    for note in reading.get('notes') or []:
        x = int(note['x'])
        # notes may not carry y; skip colouring if so
        if 'y' not in note:
            continue
        y = int(note['y'])
        color = np.array([220, 50, 50] if note.get('low') else [20, 140, 80], np.uint8)
        y0 = max(0, y - 8)
        y1 = min(rgb.shape[0], y + 9)
        x0 = max(0, x - 8)
        x1 = min(rgb.shape[1], x + 9)
        draw_base[y0:y0 + 2, x0:x1] = color
        draw_base[y1 - 2:y1, x0:x1] = color
        draw_base[y0:y1, x0:x0 + 2] = color
        draw_base[y0:y1, x1 - 2:x1] = color
    return draw_base


def build_alphatex(reading: dict, title: str, artist: str, bpm: float, key: str) -> str:
    bars = reading.get('barBeats') or []
    if not bars:
        return beats_to_alphatex([[]], title, artist, bpm, key)
    cleaned = []
    for bar in bars:
        beats = []
        for beat in bar:
            notes = []
            for note in beat.get('notes') or []:
                item = {
                    'fret': note['fret'],
                    'string': note['string'],
                }
                for flag in ('bend', 'bendRelease', 'vibrato', 'slide', 'hammer', 'palm', 'letRing', 'tie'):
                    if note.get(flag):
                        item[flag] = note[flag]
                notes.append(item)
            beats.append({
                'quarters': beat.get('quarters') or 1,
                'triplet': bool(beat.get('triplet')),
                'notes': notes,
                'rest': not notes,
            })
        cleaned.append(beats)
    return beats_to_alphatex(cleaned, title, artist, bpm, key)


def yellow_timeline(frames: list[dict], views: list[list[dict]], origins: list[int],
                    barlines: list[int]) -> dict:
    """Map the yellow wash onto stitched barlines and estimate bar starts."""
    if len(barlines) < 2:
        return {'bars': [], 'visualBpm': None, 'downbeatOffset': 0.0}
    # Identify which scan frames belong to which stitched view by time overlap.
    view_ranges = []
    for view, origin in zip(views, origins):
        view_ranges.append((view[0]['t'], view[-1]['t'], origin))
    samples = []
    for frame in frames:
        y0, y1 = frame['yellow']
        if y0 < 0:
            continue
        origin = None
        for t0, t1, org in view_ranges:
            if t0 - 0.05 <= frame['t'] <= t1 + 0.05:
                origin = org
                break
        if origin is None:
            continue
        center = origin + (y0 + y1) / 2
        index = None
        for i in range(len(barlines) - 1):
            if barlines[i] - 8 <= center <= barlines[i + 1] + 8:
                index = i
                break
        if index is None:
            continue
        samples.append((frame['t'], index))
    if not samples:
        return {'bars': [], 'visualBpm': None, 'downbeatOffset': 0.0}
    by_index: dict[int, list[float]] = {}
    for t, index in samples:
        by_index.setdefault(index, []).append(t)
    starts = {index: min(times) for index, times in by_index.items()}
    periods = []
    indexes = sorted(starts)
    for a, b in zip(indexes, indexes[1:]):
        if b == a + 1:
            delta = starts[b] - starts[a]
            if 0.8 < delta < 8:
                periods.append(delta)
    if not periods:
        return {'bars': [{'index': i, 'start': starts[i]} for i in indexes],
                'visualBpm': None, 'downbeatOffset': starts.get(0, 0.0)}
    period = float(np.median(periods))
    visual_bpm = 4 * 60 / period
    # Video time at which bar 0, beat 0 starts. Negative if the reel starts mid-score.
    estimates = [starts[i] - i * period for i in indexes]
    downbeat = float(np.median(estimates))
    bars = []
    for i in indexes:
        bars.append({
            'index': i,
            'start': round(starts[i], 3),
            'end': round(starts[i] + period, 3),
        })
    return {
        'bars': bars,
        'visualBpm': round(visual_bpm, 2),
        'downbeatOffset': round(downbeat, 3),
        'barPeriod': round(period, 3),
    }


def process_video(video: str, title: str = '', artist: str = '', bpm: float = 80,
                  key: str = '', work_dir: str | None = None) -> dict:
    """Full tab pipeline. Writes tab.jpg and frames into work_dir when given."""
    crop = detect_crop(video)
    print(f'[riff] tab crop {crop[2]}x{crop[3]} at y={crop[1]}', flush=True)
    frames = scan_motion(video, crop, fps=8)
    print(f'[riff] scanned {len(frames)} frames', flush=True)
    views = segment_views(frames)
    images = []
    frame_paths = []
    if work_dir:
        os.makedirs(os.path.join(work_dir, 'frames'), exist_ok=True)
    for i, view in enumerate(views):
        t0 = view[0]['t']
        t1 = view[-1]['t']
        span = max(0.01, t1 - t0)
        times = [t0 + span * p for p in (0.2, 0.4, 0.6, 0.8)]
        # Keep times inside the clip.
        times = [max(0.0, t) for t in times]
        image = composite_view(video, crop, times)
        images.append(image)
        print(f'[riff] view {i + 1} composited', flush=True)
        if work_dir:
            path = os.path.join(work_dir, 'frames', f'{i:02d}.jpg')
            Image.fromarray(image).save(path, quality=86)
            frame_paths.append(path)
    if not images:
        # Fall back to a single mid-clip frame so the room still has something to show.
        _w, _h, dur = probe_size(video)
        image = _whiten_yellow(grab_frame(video, min(1.0, max(0.2, dur / 2)), crop))
        images = [image]
        views = [[]]
    panorama, origins = stitch_views(images)
    print(f'[riff] stitched {panorama.shape[1]}x{panorama.shape[0]} from {len(images)} views', flush=True)
    if len(views) != len(origins):
        origins = origins[:len(views)]
    print('[riff] reading tab numbers', flush=True)
    reading = read_score(panorama)
    # Attach y for the debug overlay. read_score notes may lack y; pull from internal via bar beats.
    for bar in reading.get('barBeats') or []:
        for beat in bar:
            for note in beat.get('notes') or []:
                pass
    timeline = yellow_timeline(frames, views if views and views[0] else [], origins, reading.get('barlines') or [])
    tex = build_alphatex(reading, title or 'Riff', artist, bpm, key)
    tab_path = None
    if work_dir:
        tab_path = os.path.join(work_dir, 'tab.jpg')
        Image.fromarray(panorama).save(tab_path, quality=86)
        # A second image with the clearest single view, for the filmstrip headline.
        areas = [int((im.mean(axis=2) < 120).sum()) for im in images]
        clearest = images[int(np.argmax(areas))] if images else panorama
        Image.fromarray(clearest).save(os.path.join(work_dir, 'tab-clear.jpg'), quality=88)
    technique_counts = {'bend': 0, 'slide': 0, 'vibrato': 0, 'hammer': 0, 'palm': 0, 'letRing': 0, 'tie': 0}
    for note in reading.get('notes') or []:
        for name in technique_counts:
            if note.get(name):
                technique_counts[name] += 1
    return {
        'crop': {'x': crop[0], 'y': crop[1], 'w': crop[2], 'h': crop[3]},
        'views': len(images),
        'tabImage': tab_path,
        'frames': frame_paths,
        'alphatex': tex,
        'warnings': reading.get('warnings') or [],
        'scoreBpm': reading.get('scoreBpm'),
        'noteCount': reading.get('noteCount') or 0,
        'lowConfidence': reading.get('lowConfidence') or 0,
        'barCount': len(reading.get('barBeats') or []),
        'techniques': technique_counts,
        'timeline': timeline,
        'visualBpm': timeline.get('visualBpm'),
        'downbeatOffset': timeline.get('downbeatOffset') or 0.0,
        'notes': reading.get('notes') or [],
    }
