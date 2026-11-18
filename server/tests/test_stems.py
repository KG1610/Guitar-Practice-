import os
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from server import stems

RATE = 44100


def synth_guitar_and_drums(seconds: float = 8.0):
    """A distorted sawtooth melody (A minor pentatonic) over kick + snare at 100 BPM."""
    t = np.arange(int(seconds * RATE)) / RATE
    beat = 60 / 100
    guitar = np.zeros_like(t)
    notes = [220.0, 261.63, 293.66, 329.63, 392.0, 329.63, 293.66, 261.63]
    for i, freq in enumerate(notes * 4):
        start, end = i * beat / 2, (i + 1) * beat / 2
        mask = (t >= start) & (t < end)
        local = t[mask] - start
        saw = 2 * ((local * freq) % 1) - 1
        guitar[mask] = np.tanh(4 * saw) * np.exp(-local * 3)
    drums = np.zeros_like(t)
    rng = np.random.default_rng(0)
    for k in range(int(seconds / beat)):
        at = int(k * beat * RATE)
        n = int(0.25 * RATE)
        local = np.arange(min(n, len(t) - at)) / RATE
        if k % 2 == 0:  # kick
            drums[at:at + len(local)] += np.sin(2 * np.pi * (50 + 80 * np.exp(-local * 30)) * local) * np.exp(-local * 12)
        else:  # snare
            drums[at:at + len(local)] += rng.standard_normal(len(local)) * np.exp(-local * 25) * 0.6
    return 0.35 * guitar, 0.5 * drums


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    a = a.mean(0) if a.ndim > 1 else a
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    return float(abs(np.dot(a, b)) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


class StemHelpers(unittest.TestCase):
    def test_everything_but_drums_and_bass_is_guitar(self):
        names = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']
        sources = np.stack([np.full((2, 4), i + 1, dtype=np.float32) for i in range(6)])
        parts = stems.group_sources(sources, names)
        self.assertEqual(set(parts), {'guitar', 'drums', 'bass'})
        self.assertEqual(parts['drums'][0, 0], 1)
        self.assertEqual(parts['bass'][0, 0], 2)
        self.assertEqual(parts['guitar'][0, 0], 3 + 4 + 5 + 6)

    def test_four_source_model_still_gets_a_guitar_part(self):
        names = ['drums', 'bass', 'other', 'vocals']
        parts = stems.group_sources(np.zeros((4, 2, 4), dtype=np.float32), names)
        self.assertEqual(set(parts), {'guitar', 'drums', 'bass'})

    def test_write_wav_clips_and_round_trips(self):
        audio = np.array([[0.0, 0.5, 2.0], [-0.5, -2.0, 0.25]], dtype=np.float32)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'x' / 'part.wav'
            stems.write_wav(path, audio, RATE)
            with wave.open(str(path)) as f:
                self.assertEqual((f.getnchannels(), f.getframerate(), f.getnframes()), (2, RATE, 3))
                frames = np.frombuffer(f.readframes(3), dtype='<i2').reshape(-1, 2).T
        self.assertEqual(frames[0, 2], 32767)
        self.assertEqual(frames[1, 1], -32767)


@unittest.skipUnless(stems.available() and os.environ.get('RIFF_TEST_DEMUCS') == '1',
                     'set RIFF_TEST_DEMUCS=1 with Demucs installed to run a real split')
class RealSplit(unittest.TestCase):
    def test_guitar_and_drums_land_in_their_own_parts(self):
        guitar, drums = synth_guitar_and_drums()
        mix = np.stack([guitar + drums, guitar + drums])
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / 'mix.wav'
            stems.write_wav(src, mix, RATE)
            parts, rate = stems.separate(src)
        self.assertEqual(rate, RATE)
        self.assertGreater(similarity(parts['guitar'], guitar), similarity(parts['guitar'], drums))
        self.assertGreater(similarity(parts['drums'], drums), similarity(parts['drums'], guitar))
        # Muting "guitar" should leave the drums nearly clean.
        self.assertGreater(similarity(parts['guitar'], guitar), 0.9)
        self.assertGreater(similarity(parts['drums'], drums), 0.9)


if __name__ == '__main__':
    unittest.main()
