import { describe, expect, it } from 'vitest';
import { notesFromTex } from '../src/theory/notes.js';
import { analyzeLick, guessKey, pentatonicBoxes } from '../src/theory/analyze.js';
import { explainLick } from '../src/theory/lessons.js';
import { parseKey } from '../src/theory/scales.js';

// alphaTex strings: 1 = high e … 6 = low E.
const PENT_BOX1 = String.raw`\title "pent"
.
:8 8.1 5.1 8.2 5.2 7.3 5.3 7.4 5.4 | :4 7.3{b (0 4)} 5.2 :2 5.1 |`;
const PASSING_2 = String.raw`.
:8 5.6 8.6 5.5 7.5 5.4 7.4 4.3 5.3 | 7.3 5.3 7.4 5.4 7.5 5.5 :4 5.6 |`;
const HARMONIC = String.raw`.
:8 5.6 7.6 8.6 5.5 7.5 8.5 6.4 7.4 |`;

describe('notesFromTex', () => {
  it('maps alphaTex strings to low-E-first indexes with real pitches', () => {
    const { notes, barCount } = notesFromTex(String.raw`.
:4 5.6 5.1 7.3{b (0 4)} r |`);
    expect(barCount).toBe(1);
    expect(notes[0]).toMatchObject({ string: 0, fret: 5, pc: 9, bar: 0, beat: 0 });
    expect(notes[1]).toMatchObject({ string: 5, fret: 5, pc: 9, beat: 1 });
    expect(notes[2]).toMatchObject({ string: 3, fret: 7, pc: 2, bendTo: 4 });
  });

  it('returns no notes rather than throwing on bad tex', () => {
    const out = notesFromTex('this is not :: alphatex {{');
    expect(out.notes).toEqual([]);
  });
});

describe('analyzeLick', () => {
  it('finds a box-1 minor pentatonic lick with a 4→5 bend that ends on the root', () => {
    const a = analyzeLick(notesFromTex(PENT_BOX1).notes, { key: 'A minor' });
    expect(a.scale.id).toBe('minor-pentatonic');
    expect(a.outside).toEqual([]);
    expect(a.box).toMatchObject({ index: 1, lo: 4, hi: 9 });
    expect(a.bends).toEqual([{ from: '4', to: '5', semitones: 2, count: 1 }]);
    expect(a.end).toBe('1');
    expect(a.start).toBe('b3');
  });

  it('keeps pentatonic and flags a lone 2 as a passing note', () => {
    const a = analyzeLick(notesFromTex(PASSING_2).notes, { key: 'A minor' });
    expect(a.scale.id).toBe('minor-pentatonic');
    expect(a.outside).toHaveLength(1);
    expect(a.outside[0]).toMatchObject({ degree: '2', name: 'B', role: 'passing', count: 1 });
  });

  it('picks harmonic minor when the raised 7 shows up', () => {
    const a = analyzeLick(notesFromTex(HARMONIC).notes, { key: 'A minor' });
    expect(a.scale.id).toBe('harmonic-minor');
    expect(a.fit).toBe('good');
  });

  it('guesses A minor when the riff has no key', () => {
    const notes = notesFromTex(PENT_BOX1).notes;
    expect(guessKey(notes)).toEqual({ rootPc: 9, mode: 'minor' });
    expect(analyzeLick(notes, {}).key).toMatchObject({ name: 'A minor', guessed: true });
  });
});

describe('pentatonicBoxes', () => {
  it('starts box 1 on the root on the low E string', () => {
    const boxes = pentatonicBoxes(9, 'minor').filter((b) => b.lo >= 3 && b.lo <= 17);
    expect(boxes.map((b) => [b.index, b.lo])).toEqual(
      expect.arrayContaining([[1, 4], [2, 7], [3, 9], [4, 11], [5, 14]]),
    );
  });
});

describe('explainLick', () => {
  it('says it in plain English with note names', () => {
    const out = explainLick(analyzeLick(notesFromTex(PENT_BOX1).notes, { key: 'A minor' }));
    expect(out.headline).toBe('A minor pentatonic · box 1');
    expect(out.facts.join(' ')).toContain('bends the 4 (D) up a whole step to the 5 (E)');
    expect(out.facts.join(' ')).toContain('lands on the 1 (A)');
    expect(out.concept.formula).toBe('1 A · b3 C · 4 D · 5 E · b7 G');
    expect(out.prompts.map((p) => p.title)).toEqual(
      ['Change the last note', 'Same idea, next box', 'Add one new note', 'Move the bend', 'Answer it'],
    );
    expect(out.prompts[0].text).toContain('5 (E)');
  });

  it('names where a passing note comes from', () => {
    const out = explainLick(analyzeLick(notesFromTex(PASSING_2).notes, { key: 'A minor' }));
    expect(out.facts.join(' ')).toContain('The 2 (B) shows up once, as a passing note');
    expect(out.facts.join(' ')).toContain('natural minor');
  });
});

describe('parseKey', () => {
  it('reads sharps, flats and short forms', () => {
    expect(parseKey('F# minor')).toEqual({ rootPc: 6, mode: 'minor' });
    expect(parseKey('Bb major')).toEqual({ rootPc: 10, mode: 'major' });
    expect(parseKey('Em')).toEqual({ rootPc: 4, mode: 'minor' });
    expect(parseKey('nonsense')).toBe(null);
  });
});
