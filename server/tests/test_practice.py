import unittest

from server.practice import MIN_SPEED, clean_mix, clean_speed, clean_trainer


class PracticeTests(unittest.TestCase):
    def test_defaults_for_missing_or_bad_input(self):
        expected = {'enabled': False, 'start': 0.5, 'step': 0.05, 'every': 4, 'target': 1.0, 'fadeGuitar': False}
        self.assertEqual(clean_trainer(None), expected)
        self.assertEqual(clean_trainer({'start': 'fast', 'every': None}), expected)

    def test_clamps(self):
        out = clean_trainer({'enabled': 1, 'start': 0.1, 'step': 2, 'every': 100, 'target': 3})
        self.assertEqual(out, {'enabled': True, 'start': MIN_SPEED, 'step': 0.25, 'every': 32, 'target': 1.0, 'fadeGuitar': False})

    def test_target_not_below_start(self):
        self.assertEqual(clean_trainer({'start': 0.8, 'target': 0.6})['target'], 0.8)

    def test_speed(self):
        self.assertEqual(clean_speed(0.1), MIN_SPEED)
        self.assertEqual(clean_speed('x'), 1.0)
        self.assertEqual(clean_speed(0.654), 0.65)

    def test_mix(self):
        self.assertEqual(clean_mix(None), {'guitar': 1.0, 'drums': 1.0, 'bass': 1.0})
        self.assertEqual(clean_mix({'guitar': 0.333, 'drums': 7, 'bass': 'x', 'extra': 1})['guitar'], 0.33)
        self.assertEqual(clean_mix({'drums': 7})['drums'], 1.0)
        self.assertNotIn('extra', clean_mix({'extra': 1}))


if __name__ == '__main__':
    unittest.main()
