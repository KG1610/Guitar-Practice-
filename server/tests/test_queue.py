import unittest

from server.queue import known_keys, merge_queues, normalize_url, parse_queue, pending_entries, read_local_queue


class QueueTests(unittest.TestCase):
    def test_normalize_ignores_scheme_and_www(self):
        self.assertEqual(
            normalize_url('https://www.Facebook.com/share/r/1FZGC2nZgS/'),
            normalize_url('http://facebook.com/share/r/1FZGC2nZgS'),
        )

    def test_seed_file_has_the_a_minor_reel(self):
        entries = read_local_queue()
        urls = [entry['url'] for entry in entries]
        self.assertIn('https://www.facebook.com/share/r/1FZGC2nZgS/', urls)
        seed = next(entry for entry in entries if '1FZGC2nZgS' in entry['url'])
        self.assertIn('A Minor', seed['title'])
        self.assertTrue(seed['added'])

    def test_merge_keeps_both_lists_once_each(self):
        remote = [{'url': 'https://www.facebook.com/share/r/AAA/'}]
        local = [{'url': 'https://facebook.com/share/r/AAA?mibextid=x'}, {'url': 'https://www.facebook.com/share/r/BBB/'}]
        merged = merge_queues(remote, local)
        self.assertEqual([normalize_url(e['url']) for e in merged], ['facebook.com/share/r/AAA', 'facebook.com/share/r/BBB'])
        self.assertIs(merged[0], remote[0])

    def test_parse_object_or_array(self):
        wrapped = parse_queue({'riffs': [{'url': 'https://youtu.be/abc', 'notes': 'slow'}]})
        bare = parse_queue([{'url': 'https://youtu.be/abc'}])
        self.assertEqual(wrapped[0]['notes'], 'slow')
        self.assertEqual(bare[0]['url'], 'https://youtu.be/abc')
        self.assertEqual(parse_queue({'riffs': [{'title': 'no url'}]}), [])

    def test_pending_skips_saved_url_and_video_id(self):
        records = [{
            'id': '28739829985639091',
            'videoId': '28739829985639091',
            'sourceUrl': 'https://www.facebook.com/reel/28739829985639091',
            'sourceUrls': ['https://www.facebook.com/share/r/1FZGC2nZgS/'],
        }]
        entries = [entry for entry in read_local_queue() if '1FZGC2nZgS' in entry['url']]
        self.assertEqual(len(entries), 1)
        self.assertEqual(pending_entries(entries, records), [])
        fresh = [{'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'title': 'New'}]
        self.assertEqual(len(pending_entries(fresh, records)), 1)
        self.assertIn('id:28739829985639091', known_keys(records))


if __name__ == '__main__':
    unittest.main()
