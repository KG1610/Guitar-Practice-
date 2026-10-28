import unittest

from server.music import (
    clean_title,
    hints_from_text,
    parse_bpm,
    parse_key_name,
    resolve_key,
    resolve_tempo,
    beats_to_alphatex,
    duration_token,
    tab_chroma,
)
from server.tab_vision import shift_1d
import numpy as np


class HintTests(unittest.TestCase):
    def test_title_bpm_and_key(self):
        text = 'Easy A Minor Guitar Solo 80 bpm for practise + tabs'
        self.assertEqual(parse_bpm(text), 80)
        self.assertEqual(parse_key_name(text), 'A minor')
        hints = hints_from_text(text)
        self.assertEqual(hints['bpm'], 80)
        self.assertEqual(hints['key'], 'A minor')

    def test_short_key_and_not_the_word_am(self):
        self.assertEqual(parse_key_name('backing track in Em'), 'E minor')
        self.assertIsNone(parse_key_name('here i am again'))

    def test_facebook_title_cleanup(self):
        raw = '2.1K views · 268 reactions | Easy A Minor Guitar Solo 80 bpm for practise + tabs #guitarplayer | Den Kondrashev'
        title = clean_title(raw, 'Den Kondrashev')
        self.assertIn('Easy A Minor', title)
        self.assertNotIn('views', title.lower())
        self.assertNotIn('#guitar', title)

    def test_double_time_uses_title(self):
        got = resolve_tempo(161.5, title_bpm=80, visual_bpm=80.2)
        self.assertEqual(got['bpm'], 80)
        self.assertEqual(got['source'], 'title')
        self.assertIn('double-time', got['note'])

    def test_visual_bar_without_title(self):
        got = resolve_tempo(161.5, visual_bpm=79.5)
        self.assertAlmostEqual(got['bpm'], 79.5, places=1)
        self.assertEqual(got['source'], 'visual')

    def test_audio_only(self):
        got = resolve_tempo(96)
        self.assertEqual(got['bpm'], 96)
        self.assertEqual(got['source'], 'audio')

    def test_unrelated_title_does_not_override(self):
        got = resolve_tempo(120, title_bpm=200)
        self.assertEqual(got['source'], 'audio')
        self.assertEqual(got['bpm'], 120)


class KeyTests(unittest.TestCase):
    def test_title_wins_relative_major(self):
        # C major slightly ahead of A minor, the usual relative-key mixup.
        ranking = [('C major', 0.86), ('A minor', 0.84), ('E minor', 0.55)]
        got = resolve_key(ranking, title_key='A minor')
        self.assertEqual(got['key'], 'A minor')
        self.assertEqual(got['source'], 'title')
        self.assertIn('C major', got['note'])

    def test_no_title_returns_top(self):
        ranking = [('E minor', 0.9), ('A minor', 0.4)]
        got = resolve_key(ranking)
        self.assertEqual(got['key'], 'E minor')


class TexTests(unittest.TestCase):
    def test_triplet_and_bend_tokens(self):
        self.assertEqual(duration_token(0.5), ':8')
        self.assertEqual(duration_token(1 / 3, triplet=True), ':8 {tu 3}')
        tex = beats_to_alphatex(
            [[{
                'quarters': 0.5,
                'triplet': False,
                'notes': [{'fret': 8, 'string': 2, 'bend': 'full', 'bendRelease': True},
                          {'fret': 7, 'string': 3}],
            }]],
            'Easy', 'Den', 80, 'A minor',
        )
        self.assertIn('\\tempo (80)', tex)
        self.assertIn('(8.2{b (0 4)} 7.3)', tex)
        self.assertIn('\\ts (4 4)', tex)

    def test_tab_chroma_skips_ties(self):
        chroma = tab_chroma([
            {'string': 1, 'fret': 5},  # A
            {'string': 1, 'fret': 5, 'tie': True},
        ])
        self.assertEqual(chroma[9], 1.0)
        self.assertEqual(sum(chroma), 1.0)


class ShiftTests(unittest.TestCase):
    def test_shift_detects_left_scroll(self):
        a = np.zeros(200, np.float32)
        b = np.zeros(200, np.float32)
        a[80:100] = 1
        b[50:70] = 1  # content moved left by 30
        shift = shift_1d(a, b)
        self.assertAlmostEqual(shift, 30, delta=1)


if __name__ == '__main__':
    unittest.main()
