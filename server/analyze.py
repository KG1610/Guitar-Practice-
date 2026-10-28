"""Onset tempo and chroma key from a local video or audio file.

ffmpeg does the decode. The estimates are intentionally simple: spectral-flux
autocorrelation for tempo, and a pitch-class histogram against the Krumhansl
profiles for key. Octave errors are resolved later with the title and the tab.
"""

from __future__ import annotations

import subprocess

import numpy as np

from server.music import rank_keys, resolve_key, resolve_tempo


def read_mono(path: str, sr: int = 22050) -> np.ndarray:
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', path,
        '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-',
    ], stderr=subprocess.DEVNULL)
    if not raw:
        return np.zeros(0, np.float32)
    return np.frombuffer(raw, dtype=np.float32).copy()


def _onset_envelope(samples: np.ndarray, sr: int, hop: int = 512, nfft: int = 2048) -> np.ndarray:
    if len(samples) < nfft:
        return np.zeros(1, np.float32)
    window = np.hanning(nfft).astype(np.float32)
    n = 1 + (len(samples) - nfft) // hop
    env = np.zeros(n, np.float32)
    prev = None
    for i in range(n):
        frame = samples[i * hop:i * hop + nfft] * window
        mag = np.abs(np.fft.rfft(frame))
        if prev is not None:
            env[i] = np.maximum(0, mag - prev).sum()
        prev = mag
    # Light smoothing so a single transient doesn't dominate.
    if len(env) > 5:
        kernel = np.array([0.25, 0.5, 0.25], np.float32)
        env = np.convolve(env, kernel, mode='same')
    return env


def estimate_tempo(samples: np.ndarray, sr: int = 22050) -> dict:
    hop = 512
    env = _onset_envelope(samples, sr, hop=hop)
    if len(env) < 8 or float(env.max()) <= 0:
        return {'bpm': None, 'confidence': 0.0}
    env = env - env.mean()
    ac = np.correlate(env, env, mode='full')
    ac = ac[len(ac) // 2:]
    ac[0] = 0
    frame_rate = sr / hop
    # Search 40–240 BPM.
    lag_min = max(1, int(frame_rate * 60 / 240))
    lag_max = min(len(ac) - 1, int(frame_rate * 60 / 40))
    if lag_max <= lag_min:
        return {'bpm': None, 'confidence': 0.0}
    window = ac[lag_min:lag_max]
    peak_lag = lag_min + int(np.argmax(window))
    peak = float(ac[peak_lag])
    # Parabolic interpolation around the peak.
    if 0 < peak_lag < len(ac) - 1:
        a, b, c = float(ac[peak_lag - 1]), float(ac[peak_lag]), float(ac[peak_lag + 1])
        denom = (a - 2 * b + c)
        if denom != 0:
            peak_lag = peak_lag + 0.5 * (a - c) / denom
    bpm = 60.0 * frame_rate / peak_lag
    # Confidence: peak vs the median of the tempo window.
    med = float(np.median(window)) + 1e-6
    confidence = max(0.0, min(1.0, (peak - med) / (abs(peak) + abs(med))))
    secondary = None
    # Double-time peak (half the lag). Busy 8th-note chugs often tie or beat the true tempo.
    double_lag = int(round(peak_lag / 2))
    if lag_min <= double_lag < lag_max and peak > 0 and ac[double_lag] > peak * 0.45:
        secondary = round(60.0 * frame_rate / double_lag, 2)
    return {
        'bpm': round(float(bpm), 2),
        'confidence': round(confidence, 3),
        'secondaryBpm': secondary,
    }


def _chroma(samples: np.ndarray, sr: int = 22050) -> np.ndarray:
    nfft = 4096
    hop = 2048
    if len(samples) < nfft:
        return np.zeros(12, np.float32)
    window = np.hanning(nfft).astype(np.float32)
    freqs = np.fft.rfftfreq(nfft, 1 / sr)
    pcs = np.full(len(freqs), -1, np.int16)
    for i, freq in enumerate(freqs):
        if freq < 70 or freq > 4000:
            continue
        midi = int(round(69 + 12 * np.log2(freq / 440.0)))
        pcs[i] = midi % 12
    chroma = np.zeros(12, np.float32)
    n = 1 + (len(samples) - nfft) // hop
    for i in range(n):
        frame = samples[i * hop:i * hop + nfft] * window
        mag = np.abs(np.fft.rfft(frame))
        for pc in range(12):
            chroma[pc] += mag[pcs == pc].sum()
    total = float(chroma.sum())
    if total > 0:
        chroma /= total
    return chroma


def analyse_audio(path: str, title_bpm: float | None = None, title_key: str | None = None,
                  visual_bpm: float | None = None, score_bpm: float | None = None,
                  tab_chroma=None) -> dict:
    samples = read_mono(path)
    tempo = estimate_tempo(samples)
    chroma = _chroma(samples)
    ranking = rank_keys(chroma.tolist())
    resolved_tempo = resolve_tempo(
        tempo.get('bpm') or 0,
        title_bpm=title_bpm,
        visual_bpm=visual_bpm,
        score_bpm=score_bpm,
    )
    secondary = tempo.get('secondaryBpm')
    if secondary and resolved_tempo.get('bpm') and abs(secondary - resolved_tempo['bpm'] * 2) / resolved_tempo['bpm'] < 0.2:
        resolved_tempo['note'] += f". A second onset peak near {secondary:.0f} is the double-time reading (the one that comes out around 160 on this kind of lick)"
        resolved_tempo['secondaryBpm'] = secondary
    resolved_key = resolve_key(ranking, title_key=title_key, tab_chroma=tab_chroma)
    return {
        'tempo': resolved_tempo,
        'key': resolved_key,
        'audioBpm': tempo.get('bpm'),
        'audioTempoConfidence': tempo.get('confidence'),
    }
