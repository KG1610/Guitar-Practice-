/**
 * Turn an analyzeLick() result into plain English: what the lick is made of,
 * a short "the scale" card, and a few "make it yours" exercises built from
 * this lick. Pure, so the wording can be tested.
 */
import { DEGREES, DEGREE_FEEL, pcName } from './scales.js';
import { pentatonicBoxes } from './analyze.js';

/** Note name for a degree in this key, e.g. ('b3', 9) → 'C'. */
export function noteFor(degree, rootPc) {
  return pcName(rootPc + DEGREES.indexOf(degree));
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function times(n) {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

/** Which bigger scale an outside note comes from. */
const BORROWED = {
  minor: { 2: 'natural minor', b6: 'natural minor', b5: 'the blues scale', 7: 'harmonic minor', 6: 'Dorian', b2: 'Phrygian' },
  major: { 4: 'the major scale', 7: 'the major scale', b7: 'Mixolydian', b3: 'the blues (a minor 3rd over major)' },
};

const BEND_NOTES = {
  '4>5': 'the classic rock bend, from a note that hangs up to one that feels strong',
  'b7>1': 'bending into the root, which sounds like arriving home',
  '2>b3': 'a minor-sounding bend that lands on the b3',
  'b3>4': 'the bluesy curl up from the minor 3rd',
  '5>b7': 'a big, crying bend up to the b7',
  '1>2': 'a bend that pushes off the root and leaves it hanging',
};

export function explainLick(a) {
  if (!a) return null;
  const root = pcName(a.key.rootPc);
  const name = (degree) => noteFor(degree, a.key.rootPc);
  const formula = a.scaleNotes.map((n) => `${n.degree} ${n.name}`).join(' · ');
  const facts = [];

  // 1. Scale
  if (a.fit === 'good' && !a.outside.length) {
    facts.push(`Every note is in ${root} ${a.scale.name.toLowerCase()}.`);
  } else if (a.fit === 'good') {
    facts.push(`Built on ${root} ${a.scale.name.toLowerCase()}, with ${a.outside.length === 1 ? 'one note' : `${a.outside.length} notes`} from outside it.`);
  } else {
    facts.push(`No single scale covers it cleanly: ${Math.round(a.coverage * 100)}% of the notes fit ${root} ${a.scale.name.toLowerCase()}. A fret may be misread, or the key may be off (check it under Tempo, key and downbeat).`);
  }

  // 2. Outside notes
  for (const o of a.outside) {
    const role = o.role === 'passing'
      ? 'as a passing note, stepping between two scale notes'
      : o.role === 'bent'
        ? 'but it gets bent up into the scale, so you hear where it lands rather than where it starts'
        : 'as a colour note, there for flavour';
    const from = BORROWED[a.key.mode]?.[o.degree];
    facts.push(`The ${o.degree} (${o.name}) shows up ${times(o.count)}, ${role}.${from ? ` It comes from ${from}.` : ''}`);
  }

  // 3. Position
  if (a.box) {
    facts.push(`It sits in pentatonic box ${a.box.index} (frets ${a.box.lo}–${a.box.hi}).`);
  } else if (a.span.hi > 0) {
    facts.push(`It covers frets ${a.span.lo}–${a.span.hi}, across more than one box.`);
  }

  // 4. Degrees it leans on
  const top = a.topDegrees.slice(0, 3).map((d) => d.degree);
  const chordPct = Math.round(a.chordShare * 100);
  const chordList = list(a.chordTones);
  if (top.length) facts.push(`It leans most on the ${list(top)}.`);
  facts.push(chordPct >= 40
    ? `${chordPct}% of the notes are the ${chordList}, the notes of the ${root} ${a.key.mode} chord. Those are the safe notes to land on.`
    : `Only ${chordPct}% of the notes are chord tones (${chordList}), so most of it lives on tension.`);

  // 5. Start and end
  const feel = DEGREE_FEEL[a.end]?.land;
  facts.push(`It starts on the ${a.start} (${name(a.start)}) and lands on the ${a.end} (${name(a.end)})${feel ? `, which ${feel}` : ''}.`);

  // 6. Bends
  for (const b of a.bends) {
    const size = b.semitones === 1 ? 'a half step' : b.semitones === 2 ? 'a whole step' : `${b.semitones} half steps`;
    const note = BEND_NOTES[`${b.from}>${b.to}`];
    facts.push(`It bends the ${b.from} (${name(b.from)}) up ${size} to the ${b.to} (${name(b.to)}).${note ? ` That is ${note}.` : ''}`);
  }

  const concept = {
    title: `${root} ${a.scale.name.toLowerCase()}`,
    formula,
    text: a.scale.sound || '',
  };

  return {
    headline: `${root} ${a.scale.name.toLowerCase()}${a.box ? ` · box ${a.box.index}` : ''}`,
    sub: a.span.hi > 0 ? `Frets ${a.span.lo}–${a.span.hi} · ${a.noteCount} notes` : `${a.noteCount} notes`,
    keyNote: a.key.guessed ? `No key saved for this riff, so ${a.key.name} is a guess from the notes.` : '',
    facts,
    concept,
    prompts: prompts(a, name),
  };
}

function prompts(a, name) {
  const out = [];
  const minor = a.key.mode === 'minor';
  const third = minor ? 'b3' : '3';

  // Change the ending.
  if (a.end === '1') {
    out.push({
      title: 'Change the last note',
      text: `Play it as written, but end on the 5 (${name('5')}) instead of the root. It turns a full stop into a question. Then try ending on the ${third} (${name(third)}).`,
    });
  } else {
    out.push({
      title: 'Change the last note',
      text: `Play it as written, but make the last note the root (${name('1')}). Hear it go from "${DEGREE_FEEL[a.end]?.land ?? 'open'}" to finished.`,
    });
  }

  // Move to the next box.
  if (a.box) {
    const nextIndex = (a.box.index % 5) + 1;
    const candidates = pentatonicBoxes(a.key.rootPc, a.key.mode).filter((b) => b.index === nextIndex && b.lo >= a.box.lo);
    const next = candidates.sort((x, y) => x.lo - y.lo)[0];
    if (next) {
      out.push({
        title: 'Same idea, next box',
        text: `Keep the rhythm, but play it only with notes from box ${next.index} (frets ${next.lo}–${next.hi}). It is the same scale in a new shape: this is how the boxes join up the neck.`,
      });
    }
  }

  // Add colour, depending on the scale.
  const colour = {
    'minor-pentatonic': `Add the 2 (${name('2')}) between the 1 and the b3, and the b6 (${name('b6')}) between the 5 and the b7. That is the natural minor scale. Then raise the b7 to the 7 (${name('7')}) for harmonic minor.`,
    'minor-blues': `Use the b5 (${name('b5')}) only on the way between the 4 (${name('4')}) and the 5 (${name('5')}). Never sit on it. Then try the same move coming down.`,
    'natural-minor': `Wherever the b7 (${name('b7')}) shows up, play the 7 (${name('7')}) instead. That one change is harmonic minor, the neoclassical metal sound.`,
    'harmonic-minor': `Find the 7 (${name('7')}) and resolve it up a half step to the root every time. Then run b6–7–1 (${name('b6')}–${name('7')}–${name('1')}): that wide gap is the sound of the scale.`,
    phrygian: `Lean on the b2 (${name('b2')}): root, b2, root, palm-muted on the low strings. That half step is the thrash sound.`,
    dorian: `Play the lick with the 6 (${name('6')}), then again with the b6 (${name('b6')}). Same lick, brighter versus darker minor.`,
    'melodic-minor': `Play it once with the 6 and 7 (${name('6')}, ${name('7')}) and once with the b6 and b7 (${name('b6')}, ${name('b7')}). Hear how much the top of the scale changes the mood.`,
    'major-pentatonic': `Hammer on from the b3 (${name('b3')}) to the 3 (${name('3')}). That half-step slide into the 3 is the classic blues-rock major move.`,
    major: `Swap the 7 (${name('7')}) for the b7 (${name('b7')}). That is Mixolydian, the classic-rock version of major.`,
    mixolydian: `Swap the b7 (${name('b7')}) for the 7 (${name('7')}) to hear plain major, then go back. The b7 is what makes it rock.`,
  }[a.scale.id];
  if (colour) out.push({ title: 'Add one new note', text: colour });

  // Bends.
  if (a.bends.length) {
    const b = a.bends[0];
    const alt = b.from === 'b7' ? '4' : 'b7';
    const altTo = alt === 'b7' ? '1' : '5';
    out.push({
      title: 'Move the bend',
      text: `The lick bends the ${b.from} to the ${b.to}. Try the same bend from the ${alt} (${name(alt)}) up to the ${altTo} (${name(altTo)}) instead, and use it to end the phrase.`,
    });
  } else {
    out.push({
      title: 'Add a bend',
      text: `Bend the 4 (${name('4')}) up a whole step until it matches the 5 (${name('5')}), and hold it. Use it as the last note of the lick.`,
    });
  }

  // Call and response.
  out.push({
    title: 'Answer it',
    text: `Play the first bar of the lick, then make up your own answer bar using only the ${list(a.chordTones)} (${a.chordTones.map(name).join(', ')}). End on the root.`,
  });
  return out;
}
