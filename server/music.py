"""Tempo, key, and alphaTex helpers. No video required."""

from __future__ import annotations

import re

PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
# Krumhansl-Kessler (normalized-ish major / minor profiles).
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
# Open-string pitch classes, string 1 (high e) first.
OPEN_PC = [4, 11, 7, 2, 9, 4]

_KEY_WORD = re.compile(
    r'\b([A-G](?:#|b|♯|♭)?)\s*(minor|major|min|maj)\b',
    re.IGNORECASE,
)
_KEY_SHORT = re.compile(r'(?<![A-Za-z])([A-G](?:#|b|♯|♭)?)m\b')
_BPM = re.compile(r'\b(\d{2,3}(?:\.\d+)?)\s*bpm\b', re.IGNORECASE)
_VIEWS = re.compile(r'\d+(?:\.\d+)?\s*[KM]?\s+views|\breactions\b', re.IGNORECASE)


def _pc_of(name: str) -> int | None:
    cleaned = name.strip().replace('♯', '#').replace('♭', 'b')
    aliases = {
        'Db': 'C#', 'D#': 'Eb', 'Gb': 'F#', 'G#': 'Ab', 'A#': 'Bb',
        'C': 'C', 'C#': 'C#', 'D': 'D', 'Eb': 'Eb', 'E': 'E', 'F': 'F',
        'F#': 'F#', 'G': 'G', 'Ab': 'Ab', 'A': 'A', 'Bb': 'Bb', 'B': 'B',
    }
    canon = aliases.get(cleaned)
    if canon is None:
        return None
    return PITCH_NAMES.index(canon)


def parse_key_name(text: str) -> str | None:
    """Return 'A minor' / 'C major' from a title or description fragment."""
    if not text:
        return None
    match = _KEY_WORD.search(text)
    if match:
        pc = _pc_of(match.group(1))
        if pc is None:
            return None
        minor = match.group(2).lower().startswith('min')
        return f'{PITCH_NAMES[pc]} {"minor" if minor else "major"}'
    for match in _KEY_SHORT.finditer(text):
        token = match.group(0)
        # Skip the English word "am".
        if token == 'am':
            continue
        pc = _pc_of(match.group(1))
        if pc is None:
            continue
        return f'{PITCH_NAMES[pc]} minor'
    return None


def parse_bpm(text: str) -> float | None:
    if not text:
        return None
    match = _BPM.search(text)
    if not match:
        return None
    value = float(match.group(1))
    if 40 <= value <= 240:
        return value
    return None


def clean_title(raw: str, uploader: str = '') -> str:
    """Facebook titles look like '12K views | Actual title | Uploader'."""
    text = (raw or '').strip()
    if not text:
        return 'Untitled riff'
    parts = [part.strip() for part in text.split('|') if part.strip()]
    kept = []
    up = (uploader or '').strip().lower()
    for part in parts:
        if _VIEWS.search(part):
            continue
        if up and part.lower() == up:
            continue
        kept.append(part)
    title = kept[0] if kept else text
    title = re.sub(r'\s+#\w+', '', title).strip()
    return title or 'Untitled riff'


def hints_from_text(*chunks: str) -> dict:
    text = '\n'.join(chunk for chunk in chunks if chunk)
    return {
        'bpm': parse_bpm(text),
        'key': parse_key_name(text),
    }


def _agrees(a: float, b: float, tol: float = 0.08) -> bool:
    if a is None or b is None or b == 0:
        return False
    return abs(a - b) / abs(b) <= tol


def resolve_tempo(audio_bpm: float, title_bpm: float | None = None,
                  visual_bpm: float | None = None, score_bpm: float | None = None) -> dict:
    """Pick a practice tempo, collapsing double/half-time against printed hints.

    The onset detector on a muted chug often locks to the 8th note (2x). A printed
    '80 bpm', a score tempo mark, or the yellow bar advancing once a bar breaks the tie.
    """
    audio = float(audio_bpm) if audio_bpm else 0.0
    harmonics = []
    if audio > 0:
        for factor, label in ((0.5, 'half'), (1.0, 'audio'), (2.0, 'double')):
            value = audio * factor
            if 40 <= value <= 240:
                harmonics.append((value, label))

    def nearest_harmonic(target: float):
        if not harmonics:
            return None
        return min(harmonics, key=lambda item: abs(item[0] - target))

    if title_bpm:
        title_bpm = float(title_bpm)
        harmonic = nearest_harmonic(title_bpm)
        visual_ok = visual_bpm and (_agrees(visual_bpm, title_bpm) or _agrees(visual_bpm * 2, title_bpm) or _agrees(visual_bpm / 2, title_bpm))
        score_ok = score_bpm and _agrees(score_bpm, title_bpm)
        if (harmonic and _agrees(harmonic[0], title_bpm, 0.12)) or visual_ok or score_ok:
            bits = ['title says {:.0f} BPM'.format(title_bpm)]
            if harmonic and harmonic[1] == 'half':
                bits.append('audio onset {:.1f} reads double-time'.format(audio))
            elif harmonic and harmonic[1] == 'double':
                bits.append('audio onset {:.1f} reads half-time'.format(audio))
            elif audio:
                bits.append('audio onset {:.1f}'.format(audio))
            if visual_bpm:
                bits.append('yellow bar ≈ {:.0f} BPM'.format(visual_bpm))
            if score_bpm:
                bits.append('score mark {:.0f}'.format(score_bpm))
            return {
                'bpm': round(title_bpm, 1),
                'source': 'title',
                'note': '; '.join(bits),
                'audioBpm': round(audio, 1) if audio else None,
                'visualBpm': round(visual_bpm, 1) if visual_bpm else None,
                'scoreBpm': round(score_bpm, 1) if score_bpm else None,
            }

    if visual_bpm:
        visual_bpm = float(visual_bpm)
        harmonic = nearest_harmonic(visual_bpm)
        if harmonic and _agrees(harmonic[0], visual_bpm, 0.12):
            chosen = visual_bpm
            note = 'yellow highlight advances at about {:.0f} BPM'.format(visual_bpm)
            if harmonic[1] == 'half':
                note += ' (audio onset {:.1f} reads double-time)'.format(audio)
            elif harmonic[1] == 'double':
                note += ' (audio onset {:.1f} reads half-time)'.format(audio)
            return {
                'bpm': round(chosen, 1),
                'source': 'visual',
                'note': note,
                'audioBpm': round(audio, 1) if audio else None,
                'visualBpm': round(visual_bpm, 1),
                'scoreBpm': round(score_bpm, 1) if score_bpm else None,
            }

    if score_bpm:
        score_bpm = float(score_bpm)
        harmonic = nearest_harmonic(score_bpm)
        if not harmonic or _agrees(harmonic[0], score_bpm, 0.12):
            return {
                'bpm': round(score_bpm, 1),
                'source': 'score',
                'note': 'tempo mark on the tab ({:.0f})'.format(score_bpm),
                'audioBpm': round(audio, 1) if audio else None,
                'visualBpm': round(visual_bpm, 1) if visual_bpm else None,
                'scoreBpm': round(score_bpm, 1),
            }

    fallback = audio if 40 <= audio <= 240 else (title_bpm or visual_bpm or 80)
    return {
        'bpm': round(float(fallback), 1),
        'source': 'audio' if audio else 'default',
        'note': 'audio onset {:.1f} BPM — tap or type if that is double-time'.format(audio) if audio else 'no tempo found; defaulted',
        'audioBpm': round(audio, 1) if audio else None,
        'visualBpm': round(visual_bpm, 1) if visual_bpm else None,
        'scoreBpm': round(score_bpm, 1) if score_bpm else None,
    }


def _pearson(a, b) -> float:
    n = len(a)
    ma = sum(a) / n
    mb = sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


def rank_keys(chroma) -> list[tuple[str, float]]:
    """chroma: 12 pitch-class weights, C = index 0."""
    weights = [float(v) for v in chroma]
    if sum(weights) <= 0:
        return []
    scored = []
    for pc in range(12):
        aligned = weights[pc:] + weights[:pc]
        major = _pearson(aligned, MAJOR_PROFILE)
        minor = _pearson(aligned, MINOR_PROFILE)
        scored.append((f'{PITCH_NAMES[pc]} major', major))
        scored.append((f'{PITCH_NAMES[pc]} minor', minor))
    scored.sort(key=lambda item: -item[1])
    return scored


def _parse_key_parts(name: str) -> tuple[int, bool] | None:
    if not name:
        return None
    bits = name.split()
    if len(bits) != 2:
        return None
    pc = _pc_of(bits[0])
    if pc is None:
        return None
    return pc, bits[1] == 'minor'


def _relative_name(name: str) -> str | None:
    parts = _parse_key_parts(name)
    if not parts:
        return None
    pc, minor = parts
    if minor:
        return f'{PITCH_NAMES[(pc + 3) % 12]} major'
    return f'{PITCH_NAMES[(pc - 3) % 12]} minor'


def _parallel_name(name: str) -> str | None:
    parts = _parse_key_parts(name)
    if not parts:
        return None
    pc, minor = parts
    return f'{PITCH_NAMES[pc]} {"major" if minor else "minor"}'


def resolve_key(audio_ranking: list[tuple[str, float]], title_key: str | None = None,
                tab_chroma=None) -> dict:
    """Combine chroma, tab pitch classes, and a printed key.

    C major / A minor share a pitch collection, so a title that names one of them
    wins when the two scores are close. E minor is a common third guess on guitar
    recordings; the same rule applies if the title is explicit.
    """
    combined: dict[str, float] = {}
    for name, score in audio_ranking:
        combined[name] = float(score)
    tab_ranking = rank_keys(tab_chroma) if tab_chroma is not None else []
    if tab_ranking:
        for name, score in tab_ranking:
            combined[name] = combined.get(name, 0.0) * 0.5 + float(score) * 0.5
    if not combined:
        chosen = title_key or 'A minor'
        return {
            'key': chosen,
            'source': 'title' if title_key else 'default',
            'note': 'no pitch content to analyse' if not title_key else 'printed key (no audio chroma)',
            'ranking': [],
        }
    ranking = sorted(combined.items(), key=lambda item: -item[1])
    best_name, best_score = ranking[0]
    audio_top = audio_ranking[0][0] if audio_ranking else None

    if title_key and title_key in combined:
        title_score = combined[title_key]
        relatives = {best_name, _relative_name(best_name), _parallel_name(best_name)}
        close = best_score <= 0 or title_score >= best_score * 0.82
        others = [name for name, _score in ranking[:4] if name != title_key][:3]
        note = f'printed key {title_key}'
        if others:
            note += f'. Audio also ranked {", ".join(others)} highly — same pitch collection, different tonic — so the title breaks the tie'
        if not (close or title_key in relatives):
            note += f'. The top audio score was {best_name}; change the key if the lick is not in {title_key}'
        return {
            'key': title_key,
            'source': 'title',
            'note': note,
            'ranking': [{'key': n, 'score': round(s, 3)} for n, s in ranking[:6]],
        }

    source = 'tab' if tab_ranking and (not audio_ranking or tab_ranking[0][1] >= (audio_ranking[0][1] if audio_ranking else 0)) else 'audio'
    return {
        'key': best_name,
        'source': source,
        'note': f'estimated {best_name}' + (f' (audio top {audio_top})' if audio_top and audio_top != best_name else ''),
        'ranking': [{'key': n, 'score': round(s, 3)} for n, s in ranking[:6]],
    }


def fret_pc(string: int, fret: int) -> int:
    return (OPEN_PC[string - 1] + int(fret)) % 12


def tab_chroma(notes: list[dict]) -> list[float]:
    chroma = [0.0] * 12
    for note in notes:
        if note.get('tie'):
            continue
        string = int(note['string'])
        fret = int(note['fret'])
        if not 1 <= string <= 6 or fret < 0 or fret > 24:
            continue
        chroma[fret_pc(string, fret)] += 1.0
    return chroma


def key_to_fretboard(name: str) -> dict | None:
    parts = _parse_key_parts(name or '')
    if not parts:
        return None
    pc, minor = parts
    return {
        'rootPc': pc,
        'scaleId': 'natural-minor' if minor else 'major',
    }


# --- alphaTex -----------------------------------------------------------------

# This alphaTab build rejects `{d}` on a duration change, so dotted values
# snap to the nearest plain duration. The editor can put the dot back.
_DURATION_LADDER = [
    (4.0, ':1'),
    (2.0, ':2'),
    (1.0, ':4'),
    (0.5, ':8'),
    (0.25, ':16'),
    (0.125, ':32'),
]


def duration_token(quarters: float, triplet: bool = False) -> str:
    if triplet:
        if abs(quarters - (2 / 3)) < 0.08:
            return ':4 {tu 3}'
        if abs(quarters - (1 / 3)) < 0.06:
            return ':8 {tu 3}'
        if abs(quarters - (1 / 6)) < 0.04:
            return ':16 {tu 3}'
    return min(_DURATION_LADDER, key=lambda item: abs(item[0] - quarters))[1]


def _effect_block(note: dict) -> str:
    parts = []
    bend = note.get('bend')
    if bend:
        # Quarter-tones: half-step = 2, full step = 4, step and a half = 6.
        # The short form renders; the bendrelease graph crashes this alphaTab build.
        amount = {'half': 2, 'full': 4, 'onehalf': 6}.get(bend, 4)
        parts.append(f'b (0 {amount})')
    if note.get('vibrato') == 'wide':
        parts.append('vw')
    elif note.get('vibrato'):
        parts.append('v')
    if note.get('slide'):
        parts.append('sl')
    if note.get('hammer'):
        parts.append('h')
    if note.get('palm'):
        parts.append('pm')
    if note.get('letRing'):
        parts.append('lr')
    if note.get('tie'):
        parts.append('t')
    if not parts:
        return ''
    return '{' + ' '.join(parts) + '}'


def format_beat(notes: list[dict]) -> str:
    chunks = []
    for note in notes:
        chunks.append(f"{int(note['fret'])}.{int(note['string'])}{_effect_block(note)}")
    if len(chunks) == 1:
        return chunks[0]
    return '(' + ' '.join(chunks) + ')'


def beats_to_alphatex(bars: list[list[dict]], title: str, artist: str, bpm: float, key: str) -> str:
    """bars: list of bars; each bar is a list of beats.

    A beat dict: {quarters, triplet, notes: [note, ...], rest: bool}
    note: fret, string, and optional technique flags.
    """
    safe_title = (title or 'Riff').replace('"', "'")
    safe_artist = (artist or '').replace('"', "'")
    header = [
        f'\\title "{safe_title}"',
        f'\\artist "{safe_artist}"' if safe_artist else None,
        f'\\tempo ({int(round(bpm or 80))})',
        '\\ts (4 4)',
        f'\\subtitle "{key}"' if key else None,
        '.',
    ]
    body = []
    for bar in bars:
        if not bar:
            body.append(':1 r')
            continue
        chunks = []
        last_dur = None
        for beat in bar:
            token = duration_token(float(beat.get('quarters') or 1), bool(beat.get('triplet')))
            prefix = '' if token == last_dur else token + ' '
            last_dur = token
            if beat.get('rest') or not beat.get('notes'):
                chunks.append(prefix + 'r')
            else:
                chunks.append(prefix + format_beat(beat['notes']))
        body.append(' '.join(chunks))
    lines = [line for line in header if line]
    music = ' |\n'.join(body) + ' |'
    return '\n'.join(lines) + '\n' + music + '\n'


build_alphatex = beats_to_alphatex


def quantize_quarters(raw: float) -> tuple[float, bool]:
    """Snap a quarter-length to a standard value. Returns (quarters, triplet)."""
    options = [
        (1 / 6, True),
        (0.125, False),
        (1 / 3, True),
        (0.25, False),
        (0.375, False),
        (0.5, False),
        (2 / 3, True),
        (0.75, False),
        (1.0, False),
        (1.5, False),
        (2.0, False),
        (3.0, False),
        (4.0, False),
    ]
    best = min(options, key=lambda item: abs(item[0] - raw))
    return best
