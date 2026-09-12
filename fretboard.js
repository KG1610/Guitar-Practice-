const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAX_FRET = 15;
const LOW_E = 4;
/** Low E → high e */
const STRING_PCS = [4, 9, 2, 7, 11, 4];
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const MARKERS = new Set([3, 5, 7, 9, 12, 15]);

export const SCALES = [
  {
    id: 'harmonic-minor',
    name: 'Harmonic minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', '7'],
    colorTone: 11,
    hint: 'The 7 (gold) is the harmonic minor sound — lean into it.',
  },
  {
    id: 'natural-minor',
    name: 'Natural minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    colorTone: 10,
    hint: 'Aeolian. Softer than harmonic — b7 instead of the raised 7.',
  },
  {
    id: 'melodic-minor',
    name: 'Melodic minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    degrees: ['1', '2', 'b3', '4', '5', '6', '7'],
    colorTone: 9,
    hint: 'Jazz / fusion minor. Raised 6 and 7 going up.',
  },
  {
    id: 'minor-pentatonic',
    name: 'Minor pentatonic',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['1', 'b3', '4', '5', 'b7'],
    colorTone: 3,
    hint: 'The metal default box. Add the 7 later to taste the harmonic minor.',
  },
  {
    id: 'phrygian',
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    colorTone: 1,
    hint: 'Spanish / dark metal. Gold is the b2.',
  },
  {
    id: 'dorian',
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    colorTone: 9,
    hint: 'Minor with a raised 6. Satriani / fusion friendly.',
  },
  {
    id: 'major',
    name: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    colorTone: 4,
    hint: 'Ionian. Gold is the 3.',
  },
];

const BOX_SPANS = [
  [-1, 3],
  [1, 5],
  [3, 7],
  [5, 9],
  [8, 12],
];

const PATTERNS = [
  { id: 'all', label: 'All notes', sub: 'Full neck' },
  { id: 'box-1', label: 'Box 1', sub: 'Root box' },
  { id: 'box-2', label: 'Box 2', sub: 'Next shape' },
  { id: 'box-3', label: 'Box 3', sub: 'Mid neck' },
  { id: 'box-4', label: 'Box 4', sub: 'Upper' },
  { id: 'box-5', label: 'Box 5', sub: 'Connects back' },
  { id: '3nps', label: '3NPS', sub: '3 notes / string' },
];

function pcName(pc) {
  return NOTES[((pc % 12) + 12) % 12];
}

function rootFretOnLowE(rootPc) {
  for (let f = 0; f <= 12; f += 1) {
    if ((LOW_E + f) % 12 === rootPc) return f;
  }
  return 5;
}

function degreeIndex(rootPc, pc, intervals) {
  const rel = (pc - rootPc + 12) % 12;
  return intervals.indexOf(rel);
}

function inBox(fret, lo, hi) {
  for (const f of [fret, fret + 12, fret - 12]) {
    if (f >= lo && f <= hi) return true;
  }
  return false;
}

function threeNpsSet(rootPc, intervals) {
  const set = new Set();
  const start = rootFretOnLowE(rootPc);
  let deg = 0;
  let cursor = start;
  for (let s = 0; s < 6; s += 1) {
    const open = STRING_PCS[s];
    const used = [];
    for (let n = 0; n < 3; n += 1) {
      const want = (rootPc + intervals[deg % intervals.length]) % 12;
      let best = null;
      for (let f = 0; f <= MAX_FRET; f += 1) {
        if ((open + f) % 12 !== want) continue;
        if (best === null || Math.abs(f - cursor) < Math.abs(best - cursor)) best = f;
      }
      if (best !== null) {
        set.add(`${s}:${best}`);
        used.push(best);
        cursor = best + 1;
      }
      deg += 1;
    }
    cursor = used.length ? Math.max(0, used[0] - 1) : cursor;
  }
  return set;
}

function boxWindow(rootPc, boxIndex) {
  const root = rootFretOnLowE(rootPc);
  const [a, b] = BOX_SPANS[boxIndex];
  return { lo: root + a, hi: root + b };
}

export function mountFretboard() {
  const scaleSelect = document.getElementById('scale-select');
  const rootSelect = document.getElementById('root-select');
  const formulaEl = document.getElementById('scale-formula');
  const chipsEl = document.getElementById('scale-patterns');
  const hintEl = document.getElementById('scale-hint');
  const boardEl = document.getElementById('fretboard');
  if (!scaleSelect || !boardEl) return;

  let scaleId = 'harmonic-minor';
  let rootPc = 9; // A
  let patternId = 'all';

  for (const s of SCALES) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (s.id === scaleId) opt.selected = true;
    scaleSelect.appendChild(opt);
  }
  for (let i = 0; i < 12; i += 1) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = NOTES[i];
    if (i === rootPc) opt.selected = true;
    rootSelect.appendChild(opt);
  }

  chipsEl.innerHTML = '';
  for (const p of PATTERNS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip compact';
    btn.dataset.id = p.id;
    btn.innerHTML = `${p.label}<small>${p.sub}</small>`;
    btn.addEventListener('click', () => {
      patternId = p.id;
      render();
    });
    chipsEl.appendChild(btn);
  }

  function currentScale() {
    return SCALES.find((s) => s.id === scaleId) ?? SCALES[0];
  }

  function noteActive(stringIndex, fret, scale, nps) {
    if (patternId === 'all') return true;
    if (patternId === '3nps') return nps.has(`${stringIndex}:${fret}`);
    if (patternId.startsWith('box-')) {
      const idx = Number(patternId.slice(4)) - 1;
      const { lo, hi } = boxWindow(rootPc, idx);
      return inBox(fret, lo, hi);
    }
    return true;
  }

  function render() {
    const scale = currentScale();
    const intervalSet = new Set(scale.intervals);
    const nps = threeNpsSet(rootPc, scale.intervals);
    formulaEl.textContent = `${pcName(rootPc)} ${scale.name} · ${scale.degrees.join('  ')}`;

    const boxIdx = patternId.startsWith('box-') ? Number(patternId.slice(4)) : null;
    const root = rootFretOnLowE(rootPc);
    let where = 'Full neck — every scale tone.';
    if (boxIdx) {
      const { lo, hi } = boxWindow(rootPc, boxIdx - 1);
      where = `Box ${boxIdx} · frets ${Math.max(0, lo)}–${hi} · 6th-string root at fret ${root}.`;
    } else if (patternId === '3nps') {
      where = `3 notes per string from the 6th-string root (fret ${root}).`;
    }
    hintEl.textContent = `${where} ${scale.hint} Try: ascend / descend, then groups of 3 (1-2-3-1).`;

    chipsEl.querySelectorAll('.chip').forEach((el) => {
      el.setAttribute('aria-selected', el.dataset.id === patternId ? 'true' : 'false');
    });

    boardEl.innerHTML = '';
    const numbers = document.createElement('div');
    numbers.className = 'fret-numbers';
    numbers.appendChild(document.createElement('span'));
    for (let f = 0; f <= MAX_FRET; f += 1) {
      const n = document.createElement('span');
      n.textContent = f === 0 ? 'open' : String(f);
      if (MARKERS.has(f)) n.classList.add('marker');
      numbers.appendChild(n);
    }
    boardEl.appendChild(numbers);

    for (let display = 5; display >= 0; display -= 1) {
      const s = display;
      const row = document.createElement('div');
      row.className = 'string-row';
      const name = document.createElement('span');
      name.className = 'string-name';
      name.textContent = STRING_LABELS[s];
      row.appendChild(name);
      for (let f = 0; f <= MAX_FRET; f += 1) {
        const cell = document.createElement('div');
        cell.className = 'fret';
        if (f === 0) cell.classList.add('nut');
        if (MARKERS.has(f)) cell.classList.add('dot');
        const pc = (STRING_PCS[s] + f) % 12;
        const rel = (pc - rootPc + 12) % 12;
        if (intervalSet.has(rel)) {
          const deg = degreeIndex(rootPc, pc, scale.intervals);
          const on = noteActive(s, f, scale, nps);
          const note = document.createElement('span');
          note.className = 'note';
          if (!on) note.classList.add('ghost');
          if (rel === 0) note.classList.add('root');
          else if (rel === scale.colorTone) note.classList.add('leading');
          else note.classList.add('tone');
          note.textContent = scale.degrees[deg] ?? pcName(pc);
          note.title = `${pcName(pc)} · ${STRING_LABELS[s]} string · fret ${f}`;
          cell.appendChild(note);
        }
        row.appendChild(cell);
      }
      boardEl.appendChild(row);
    }

    const legend = document.createElement('div');
    legend.className = 'neck-legend';
    legend.innerHTML = `
      <span><i class="swatch root"></i> Root</span>
      <span><i class="swatch leading"></i> Color tone</span>
      <span><i class="swatch tone"></i> Scale</span>
      <span><i class="swatch ghost"></i> Outside pattern</span>
    `;
    boardEl.appendChild(legend);
  }

  scaleSelect.addEventListener('change', () => {
    scaleId = scaleSelect.value;
    render();
  });
  rootSelect.addEventListener('change', () => {
    rootPc = Number(rootSelect.value);
    render();
  });

  render();
}
