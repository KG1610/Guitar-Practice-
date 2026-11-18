import unittest

from server.practice import MIN_SPEED, clean_speed, clean_trainer


class PracticeTests(unittest.TestCase):
    def test_defaults_for_missing_or_bad_input(self):
        expected = {'enabled': False, 'start': 0.5, 'step': 0.05, 'every': 4, 'target': 1.0}
        self.assertEqual(clean_trainer(None), expected)
        self.assertEqual(clean_trainer({'start': 'fast', 'every': None}), expected)

    def test_clamps(self):
        out = clean_trainer({'enabled': 1, 'start': 0.1, 'step': 2, 'every': 100, 'target': 3})
        self.assertEqual(out, {'enabled': True, 'start': MIN_SPEED, 'step': 0.25, 'every': 32, 'target': 1.0})

    def test_target_not_below_start(self):
        self.assertEqual(clean_trainer({'start': 0.8, 'target': 0.6})['target'], 0.8)

    def test_speed(self):
        self.assertEqual(clean_speed(0.1), MIN_SPEED)
        self.assertEqual(clean_speed('x'), 1.0)
        self.assertEqual(clean_speed(0.654), 0.65)


if __name__ == '__main__':
    unittest.main()
