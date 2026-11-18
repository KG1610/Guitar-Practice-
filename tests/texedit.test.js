import { describe, expect, it } from 'vitest';
import { noteTokens, replaceNotes, texNotesMatch } from '../src/theory/texedit.js';
import { notesFromTex } from '../src/theory/notes.js';

// Exactly what server/music.py beats_to_alphatex writes (chords, bend, rest,
// triplets with effects, an empty bar, quotes and digits in the header).
const SERVER = String.raw`\title "Fixture 'q' 8.2"
\artist "Den"
\tempo (80)
\ts (4 4)
\subtitle "A minor"
.
:8 (8.2 7.3) 7.2{b (0 4)} :4 r :8 {tu 3} 5.2{v} 12.1{sl} 14.1{h} |
:1 r |
:1 5.4 |
`;

describe('noteTokens', () => {
  it('finds every note in order and nothing in the header or effects', () => {
    expect(noteTokens(SERVER).map((t) => `${t.fret}.${t.string}`))
      .toEqual(['8.2', '7.3', '7.2', '5.2', '12.1', '14.1', '5.4']);
  });

  it('lines up with alphaTab note for note', () => {
    const { notes, total } = notesFromTex(SERVER);
    expect(texNotesMatch(SERVER, total)).toBe(true);
    const tokens = noteTokens(SERVER);
    for (const n of notes) {
      expect(Number(tokens[n.index].fret)).toBe(n.fret);
      expect(6 - tokens[n.index].string).toBe(n.string);
    }
  });

  it('handles duration suffixes, dead notes and comments', () => {
    const tex = '.\n:4 5.6.4 x.3 // 9.9 is a comment\n7.5 /* 1.1 */ 0.1 |';
    expect(noteTokens(tex).map((t) => `${t.fret}.${t.string}`)).toEqual(['5.6', 'x.3', '7.5', '0.1']);
  });
});

describe('replaceNotes', () => {
  it('changes one note and keeps its effects and the rest of the text', () => {
    // note 2 is 7.2{b (0 4)} → move it to fret 8 on the G string (index 3)
    const out = replaceNotes(SERVER, [2], { fret: 9, string: 3 });
    expect(out).toContain('9.3{b (0 4)}');
    expect(out.replace('9.3{b (0 4)}', '7.2{b (0 4)}')).toBe(SERVER);
    const { notes } = notesFromTex(out);
    expect(notes.find((n) => n.index === 2)).toMatchObject({ fret: 9, string: 3 });
  });

  it('changes several notes, including inside a chord, and keeps durations', () => {
    const out = replaceNotes('.\n:4 5.6.4 (5.4 7.3) |', [0, 2], { fret: 3, string: 1 });
    expect(out).toBe('.\n:4 3.5.4 (5.4 3.5) |');
  });
});
