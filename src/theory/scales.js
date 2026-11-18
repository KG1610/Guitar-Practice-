/**
 * Scales, degree names and the plain-English bits the theory panel uses.
 * Shared by the Desk fretboard and the Riff Room lick breakdown.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Degree label for each semitone above the root. */
export const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

export function pcName(pc) {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

export function degreeOf(pc, rootPc) {
  return DEGREES[(((pc - rootPc) % 12) + 12) % 12];
}

/**
 * What a degree feels like, in a few words. `land` is how it sounds as the
 * last note of a phrase.
 */
export const DEGREE_FEEL = {
  1: { name: 'root', land: 'sounds finished: home base' },
  b2: { name: 'flat 2', land: 'sounds tense and dark, wants to fall to the root' },
  2: { name: '2', land: 'hangs in the air and wants to settle on the root or the b3' },
  b3: { name: 'minor 3rd', land: 'sounds settled and minor, the sad-but-stable note' },
  3: { name: 'major 3rd', land: 'sounds settled and bright' },
  4: { name: '4', land: 'hangs and wants to fall to the 3rd or climb to the 5' },
  b5: { name: 'flat 5 (blue note)', land: 'sounds gritty and unresolved, slide off it to the 4 or 5' },
  5: { name: '5', land: 'sounds strong but open, like a comma rather than a full stop' },
  b6: { name: 'flat 6', land: 'sounds dark and wants to fall a half step to the 5' },
  6: { name: '6', land: 'sounds sweet and a bit unfinished' },
  b7: { name: 'flat 7', land: 'sounds bluesy and wants to move up to the root' },
  7: { name: 'major 7th (leading tone)', land: 'pulls hard up to the root, a half step away' },
};

export const SCALES = [
  {
    id: 'harmonic-minor',
    name: 'Harmonic minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', '7'],
    colorTone: 11,
    hint: 'The 7 (amber) is the harmonic minor sound — lean into it.',
    sound: 'Natural minor with the 7th raised a half step. That 7 pulls hard up to the root, and the gap between the b6 and the 7 gives the "neoclassical" or Middle Eastern sound.',
    family: 'minor',
  },
  {
    id: 'natural-minor',
    name: 'Natural minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    colorTone: 10,
    hint: 'Aeolian. Softer than harmonic — b7 instead of the raised 7.',
    sound: 'The full minor scale (Aeolian). It is the minor pentatonic plus two in-between notes: the 2 and the b6. The b6 is what makes it sound darker than pentatonic.',
    family: 'minor',
  },
  {
    id: 'melodic-minor',
    name: 'Melodic minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    degrees: ['1', '2', 'b3', '4', '5', '6', '7'],
    colorTone: 9,
    hint: 'Jazz / fusion minor. Raised 6 and 7 going up.',
    sound: 'Minor 3rd with a major 6th and 7th. Smooth and jazzy: a minor scale that leans upward.',
    family: 'minor',
  },
  {
    id: 'minor-pentatonic',
    name: 'Minor pentatonic',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['1', 'b3', '4', '5', 'b7'],
    colorTone: 3,
    hint: 'The metal default box. Add the 7 later to taste the harmonic minor.',
    sound: 'Five notes, no half steps, so nothing clashes. The rock and metal default: 1, b3, 4, 5, b7. The 1, b3 and 5 are the minor chord, which makes them the safe landing notes.',
    family: 'minor',
  },
  {
    id: 'minor-blues',
    name: 'Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['1', 'b3', '4', 'b5', '5', 'b7'],
    colorTone: 6,
    hint: 'Minor pentatonic plus the b5 blue note. Pass through it, do not sit on it.',
    sound: 'Minor pentatonic plus one extra note, the b5 (the "blue note"). Used as a passing note between the 4 and 5 for grit.',
    family: 'minor',
  },
  {
    id: 'phrygian',
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    colorTone: 1,
    hint: 'Spanish / dark metal. Gold is the b2.',
    sound: 'Natural minor with the 2 lowered to a b2. That half step above the root is the dark, Spanish, thrash-metal sound.',
    family: 'minor',
  },
  {
    id: 'dorian',
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    colorTone: 9,
    hint: 'Minor with a raised 6. Satriani / fusion friendly.',
    sound: 'Natural minor with a major 6 instead of the b6. Still minor, but brighter and funkier (Santana, Satriani).',
    family: 'minor',
  },
  {
    id: 'major',
    name: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    colorTone: 4,
    hint: 'Ionian. Gold is the 3.',
    sound: 'The do-re-mi scale (Ionian). Bright and resolved. The 3 is what makes it major.',
    family: 'major',
  },
  {
    id: 'major-pentatonic',
    name: 'Major pentatonic',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['1', '2', '3', '5', '6'],
    colorTone: 4,
    hint: 'Country / classic rock sweetness. Same shapes as the relative minor pentatonic.',
    sound: 'Five notes: 1, 2, 3, 5, 6. Sweet and open. It uses the same shapes as the minor pentatonic three frets lower.',
    family: 'major',
  },
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['1', '2', '3', '4', '5', '6', 'b7'],
    colorTone: 10,
    hint: 'Major with a b7. Classic rock and blues-rock.',
    sound: 'Major scale with a b7. Bright but bluesy, the AC/DC and classic-rock sound.',
    family: 'major',
  },
];

export function scaleById(id) {
  return SCALES.find((s) => s.id === id);
}

/** Simplest first: the analysis prefers the smallest scale that fits the lick. */
export const CANDIDATES = {
  minor: ['minor-pentatonic', 'minor-blues', 'natural-minor', 'harmonic-minor', 'dorian', 'phrygian', 'melodic-minor'],
  major: ['major-pentatonic', 'major', 'mixolydian'],
};

/** "A minor" → { rootPc: 9, mode: 'minor' }. Accepts sharps and flats. */
export function parseKey(name) {
  if (!name) return null;
  const match = String(name).trim().match(/^([A-Ga-g])([#b♯♭]?)\s*(major|minor|maj|min|m)?$/i);
  if (!match) return null;
  const base = NOTE_NAMES.indexOf(match[1].toUpperCase());
  const accidental = match[2] === '#' || match[2] === '♯' ? 1 : match[2] === 'b' || match[2] === '♭' ? -1 : 0;
  const word = (match[3] || 'major').toLowerCase();
  const mode = word === 'minor' || word === 'min' || word === 'm' ? 'minor' : 'major';
  return { rootPc: (base + accidental + 12) % 12, mode };
}
