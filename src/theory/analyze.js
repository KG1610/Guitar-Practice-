/**
 * Work out what a lick is made of: which scale fits, which pentatonic box it
 * sits in, which degrees it leans on, where it starts and lands, what it
 * bends, and which notes sit outside the scale. Pure: notes in, facts out.
 */
import {
  CANDIDATES, DEGREES, NOTE_NAMES, degreeOf, parseKey, pcName, scaleById,
} from './scales.js';

/** Open-string pitch classes, low E → high e (standard tuning). */
export const STRING_PCS = [4, 9, 2, 7, 11, 4];
const LOW_E_PC = 4;
const CHORD_TONES = { minor: ['1', 'b3', '5'], major: ['1', '3', '5'] };
/** Share of notes that must fit a scale before we call it "the" scale. */
const GOOD_FIT = 0.9;

function relative(pc, rootPc) {
  return (((pc - rootPc) % 12) + 12) % 12;
}

function coverage(notes, rootPc, intervals) {
  if (!notes.length) return 0;
  const inside = notes.filter((n) => intervals.includes(relative(n.pc, rootPc))).length;
  return inside / notes.length;
}

/**
 * Best key for a lick when the riff has none: the scale that covers the most
 * notes, nudged toward a root the lick lands on. Minor wins ties (metal).
 */
export function guessKey(notes) {
  if (!notes.length) return null;
  const last = notes[notes.length - 1].pc;
  let best = null;
  for (const mode of ['minor', 'major']) {
    const full = scaleById(mode === 'minor' ? 'natural-minor' : 'major').intervals;
    for (let rootPc = 0; rootPc < 12; rootPc += 1) {
      const rootShare = notes.filter((n) => n.pc === rootPc).length / notes.length;
      const score = coverage(notes, rootPc, full) + (last === rootPc ? 0.15 : 0) + rootShare * 0.1;
      if (!best || score > best.score + 1e-9) best = { rootPc, mode, score };
    }
  }
  return { rootPc: best.rootPc, mode: best.mode };
}

/** Pick the simplest scale (in CANDIDATES order) that covers the lick. */
export function fitScale(notes, rootPc, mode) {
  const ids = CANDIDATES[mode] || CANDIDATES.minor;
  const scored = ids.map((id) => {
    const scale = scaleById(id);
    return { scale, coverage: coverage(notes, rootPc, scale.intervals) };
  });
  const good = scored.find((s) => s.coverage >= GOOD_FIT);
  if (good) return { ...good, fit: 'good' };
  const best = scored.reduce((a, b) => (b.coverage > a.coverage ? b : a));
  return { ...best, fit: 'loose' };
}

/**
 * The five pentatonic boxes for this key as fret windows. Box 1 starts on the
 * root on the low E string; each next box starts on the next scale tone.
 * Windows reach one fret either side for the B-string shift and stretches.
 */
export function pentatonicBoxes(rootPc, mode) {
  const intervals = scaleById(mode === 'major' ? 'major-pentatonic' : 'minor-pentatonic').intervals;
  const root = relative(rootPc, LOW_E_PC); // root fret on low E, 0–11
  const frets = [...intervals.map((i) => root + i), root + 12];
  const boxes = [];
  for (let k = 0; k < 5; k += 1) {
    for (const shift of [-12, 0, 12]) {
      const lo = frets[k] + shift - 1;
      const hi = frets[k + 1] + shift + 1;
      if (hi < 0 || lo > 24) continue;
      boxes.push({ index: k + 1, lo: Math.max(0, lo), hi });
    }
  }
  return boxes;
}

function findBox(notes, rootPc, mode) {
  const fretted = notes.filter((n) => n.fret > 0);
  if (!fretted.length) return null;
  let best = null;
  for (const box of pentatonicBoxes(rootPc, mode)) {
    const inside = fretted.filter((n) => n.fret >= box.lo && n.fret <= box.hi).length;
    if (!best || inside > best.inside) best = { ...box, inside };
  }
  const share = best.inside / fretted.length;
  return share >= 0.75 ? { index: best.index, lo: best.lo, hi: best.hi, share } : null;
}

/** Group simultaneous notes; a chord's top note is the melody note. */
function melodyLine(notes) {
  const groups = new Map();
  for (const n of notes) {
    const key = `${n.bar}:${n.beat}`;
    const prev = groups.get(key);
    if (!prev || n.midi > prev.midi) groups.set(key, n);
  }
  return [...groups.values()].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
}

export function analyzeLick(notes, { key } = {}) {
  const parsed = parseKey(key) || guessKey(notes);
  if (!notes.length || !parsed) return null;
  const { rootPc, mode } = parsed;
  const keyName = `${pcName(rootPc)} ${mode}`;
  const { scale, coverage: share, fit } = fitScale(notes, rootPc, mode);
  const inScale = (pc) => scale.intervals.includes(relative(pc, rootPc));

  const line = melodyLine(notes);
  const withDegrees = notes.map((n) => ({ ...n, degree: degreeOf(n.pc, rootPc), inScale: inScale(n.pc) }));

  const degreeCounts = {};
  for (const n of withDegrees) degreeCounts[n.degree] = (degreeCounts[n.degree] || 0) + 1;
  const topDegrees = Object.entries(degreeCounts)
    .sort((a, b) => b[1] - a[1] || DEGREES.indexOf(a[0]) - DEGREES.indexOf(b[0]))
    .map(([degree, count]) => ({ degree, count }));

  // Outside notes and what they are doing.
  const outsideMap = new Map();
  line.forEach((n, i) => {
    if (inScale(n.pc)) return;
    const entry = outsideMap.get(n.pc) || { pc: n.pc, degree: degreeOf(n.pc, rootPc), name: pcName(n.pc), count: 0, roles: { passing: 0, bent: 0, colour: 0 } };
    entry.count += 1;
    const prev = line[i - 1];
    const next = line[i + 1];
    if (n.bendTo != null && inScale(n.bendTo)) entry.roles.bent += 1;
    else if (prev && next && Math.abs(n.midi - prev.midi) <= 2 && Math.abs(next.midi - n.midi) <= 2) entry.roles.passing += 1;
    else entry.roles.colour += 1;
    outsideMap.set(n.pc, entry);
  });
  const outside = [...outsideMap.values()].map((o) => ({
    ...o,
    role: Object.entries(o.roles).sort((a, b) => b[1] - a[1])[0][0],
  }));

  const bendMap = new Map();
  for (const n of line) {
    if (n.bendTo == null) continue;
    const from = degreeOf(n.pc, rootPc);
    const to = degreeOf(n.bendTo, rootPc);
    const k = `${from}>${to}`;
    const b = bendMap.get(k) || { from, to, semitones: relative(n.bendTo, n.pc), count: 0 };
    b.count += 1;
    bendMap.set(k, b);
  }

  const fretted = notes.filter((n) => n.fret > 0).map((n) => n.fret);
  const span = fretted.length ? { lo: Math.min(...fretted), hi: Math.max(...fretted) } : { lo: 0, hi: 0 };
  const chord = CHORD_TONES[mode];
  const chordShare = notes.filter((n) => chord.includes(degreeOf(n.pc, rootPc))).length / notes.length;

  const bars = [];
  for (const n of line) {
    if (!bars[n.bar]) bars[n.bar] = { bar: n.bar, degrees: [] };
    bars[n.bar].degrees.push(n.bendTo != null ? `${degreeOf(n.pc, rootPc)}↗${degreeOf(n.bendTo, rootPc)}` : degreeOf(n.pc, rootPc));
  }

  return {
    key: { rootPc, mode, name: keyName, guessed: !parseKey(key) },
    scale,
    coverage: share,
    fit,
    notes: withDegrees,
    noteCount: notes.length,
    topDegrees,
    chordTones: chord,
    chordShare,
    outside,
    bends: [...bendMap.values()],
    span,
    box: findBox(notes, rootPc, mode),
    start: degreeOf(line[0].pc, rootPc),
    end: degreeOf(line[line.length - 1].bendTo ?? line[line.length - 1].pc, rootPc),
    bars: bars.filter(Boolean),
    scaleNotes: scale.intervals.map((i) => ({ degree: DEGREES[i], name: NOTE_NAMES[(rootPc + i) % 12] })),
  };
}
