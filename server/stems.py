"""Split a riff's audio into parts (drums, bass, guitar, other) with Demucs.

Optional: needs `pip install -r server/requirements-stems.txt` (PyTorch +
Demucs, about 1–2 GB with the model). Everything else in the helper works
without it. Audio is decoded with ffmpeg and written with the `wave` module,
so torchaudio's file backends are never used.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import threading
import wave
from pathlib import Path

import numpy as np

MODEL_NAME = os.environ.get('RIFF_STEMS_MODEL', 'htdemucs_6s')
DEVICE = os.environ.get('RIFF_STEMS_DEVICE', 'cpu')

#: What the Riff Room mixer shows, and which Demucs sources feed each part.
#: Everything that is not drums or bass goes to "guitar": Demucs often files
#: distorted lead guitar under "other", and these reels are guitar over drums,
#: so fading "guitar" has to fade all of it.
PARTS = {
    'guitar': ('guitar', 'other', 'piano', 'vocals'),
    'drums': ('drums',),
    'bass': ('bass',),
}

_MODEL = None
_MODEL_LOCK = threading.Lock()


def available() -> bool:
    return all(importlib.util.find_spec(name) is not None for name in ('torch', 'demucs'))


def _model():
    global _MODEL
    with _MODEL_LOCK:
        if _MODEL is None:
            from demucs.pretrained import get_model

            model = get_model(MODEL_NAME)
            model.eval()
            _MODEL = model
        return _MODEL


def load_audio(path: Path, samplerate: int, channels: int = 2) -> np.ndarray:
    """Decode any audio/video file to float32 (channels, samples)."""
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-vn',
        '-f', 'f32le', '-ac', str(channels), '-ar', str(samplerate), '-',
    ])
    audio = np.frombuffer(raw, dtype=np.float32)
    return audio.reshape(-1, channels).T.copy()


def write_wav(path: Path, audio: np.ndarray, samplerate: int) -> None:
    """Write float audio (channels, samples) as 16-bit PCM WAV (no encoder delay)."""
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype('<i2').T.copy()
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(audio.shape[0])
        out.setsampwidth(2)
        out.setframerate(samplerate)
        out.writeframes(pcm.tobytes())


def group_sources(sources: np.ndarray, names: list[str]) -> dict[str, np.ndarray]:
    """Sum Demucs sources (n, channels, samples) into the mixer's parts."""
    out = {}
    for part, members in PARTS.items():
        picked = [sources[names.index(name)] for name in members if name in names]
        if picked:
            out[part] = np.sum(picked, axis=0)
    return out


def separate(path: Path) -> tuple[dict[str, np.ndarray], int]:
    import torch
    from demucs.apply import apply_model

    model = _model()
    rate = model.samplerate
    audio = load_audio(path, rate, model.audio_channels)
    wav = torch.from_numpy(audio)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        sources = apply_model(
            model, ((wav - mean) / std)[None], device=DEVICE,
            shifts=1, split=True, overlap=0.25, progress=False,
        )[0]
    sources = (sources * std + mean).cpu().numpy()
    return group_sources(sources, list(model.sources)), rate


def split(video: Path, out_dir: Path) -> dict[str, str]:
    """Write one WAV per part into out_dir. Returns {part: filename}."""
    parts, rate = separate(video)
    files = {}
    for part, audio in parts.items():
        name = f'{part}.wav'
        write_wav(out_dir / name, audio, rate)
        files[part] = name
    return files
