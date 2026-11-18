"""Per-riff practice settings the Riff Room saves (speed builder)."""

from __future__ import annotations

# Keep in step with src/riff/trainer.js.
MIN_SPEED = 0.25
MAX_SPEED = 1.0
TRAINER_DEFAULTS = {'enabled': False, 'start': 0.5, 'step': 0.05, 'every': 4, 'target': 1.0, 'fadeGuitar': False}


def _num(value, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number == number else fallback  # NaN → fallback


def _clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def clean_speed(value) -> float:
    return round(_clamp(_num(value, 1.0), MIN_SPEED, MAX_SPEED), 2)


def clean_trainer(raw) -> dict:
    """Clamp a speed-builder config from the browser; anything odd gets a default."""
    raw = raw if isinstance(raw, dict) else {}
    start = round(_clamp(_num(raw.get('start'), TRAINER_DEFAULTS['start']), MIN_SPEED, MAX_SPEED), 2)
    return {
        'enabled': bool(raw.get('enabled')),
        'start': start,
        'step': round(_clamp(_num(raw.get('step'), TRAINER_DEFAULTS['step']), 0.01, 0.25), 2),
        'every': int(round(_clamp(_num(raw.get('every'), TRAINER_DEFAULTS['every']), 1, 32))),
        'target': round(_clamp(_num(raw.get('target'), TRAINER_DEFAULTS['target']), start, MAX_SPEED), 2),
        'fadeGuitar': bool(raw.get('fadeGuitar')),
    }


#: Mixer parts and their default volumes (0–1).
MIX_DEFAULTS = {'guitar': 1.0, 'drums': 1.0, 'bass': 1.0}


def clean_mix(raw) -> dict:
    """Per-part volumes for the split audio, each 0–1."""
    raw = raw if isinstance(raw, dict) else {}
    return {part: round(_clamp(_num(raw.get(part), default), 0.0, 1.0), 2) for part, default in MIX_DEFAULTS.items()}
