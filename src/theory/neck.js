/**
 * SVG fretboard for a lick: the whole scale faint in the background, the
 * lick's notes on top, coloured by what they do. High e is on top, like tab.
 */
import { DEGREES, pcName } from './scales.js';
import { STRING_PCS } from './analyze.js';

const MARKERS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE = new Set([12, 24]);

/** Which frets to draw: the lick plus a little room, at least 5 frets. */
export function neckRange(span) {
  const lo = Math.max(0, (span?.lo ?? 0) - 1);
  const hi = Math.min(24, Math.max(lo + 5, (span?.hi ?? 5) + 1));
  return { lo, hi };
}

/** root | chord | scale | outside */
export function noteRole(degree, analysis) {
  if (degree === '1') return 'root';
  if (analysis.chordTones.includes(degree)) return 'chord';
  const rel = DEGREES.indexOf(degree);
  return analysis.scale.intervals.includes(rel) ? 'scale' : 'outside';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * @param analysis  analyzeLick() result
 * @param opts.labels  'degrees' | 'notes'
 * @param opts.bar     0-based bar to emphasise, or null for the whole lick
 * @param opts.selected  note indexes being edited (ringed)
 */
export function renderNeck(analysis, { labels = 'degrees', bar = null, selected = [] } = {}) {
  const picked = new Set(selected);
  const { lo, hi } = neckRange(analysis.span);
  const showNut = lo === 0;
  const cols = hi - lo + 1;
  const cell = 46;
  const left = 34;
  const top = 16;
  const gap = 24;
  const width = left + cols * cell + 8;
  const height = top + gap * 5 + 34;
  const x = (fret) => left + (fret - lo) * cell + cell / 2;
  const y = (string) => top + (5 - string) * gap; // string 0 = low E at the bottom
  const rootPc = analysis.key.rootPc;
  const label = (pc) => (labels === 'notes' ? pcName(pc) : DEGREES[(((pc - rootPc) % 12) + 12) % 12]);

  const parts = [];
  parts.push(`<svg class="theory-neck-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lick on the fretboard">`);
  // Fret wires and numbers
  for (let f = lo; f <= hi + 1; f += 1) {
    const fx = left + (f - lo) * cell;
    const nut = showNut && f === lo + 1 && lo === 0;
    parts.push(`<line class="${nut ? 'nut' : 'fret'}" x1="${fx}" y1="${top}" x2="${fx}" y2="${top + gap * 5}" />`);
  }
  for (let f = lo; f <= hi; f += 1) {
    if (f === 0) continue;
    const mark = MARKERS.has(f) ? ' marked' : DOUBLE.has(f) ? ' marked double' : '';
    parts.push(`<text class="fret-num${mark}" x="${x(f)}" y="${top + gap * 5 + 22}">${f}</text>`);
  }
  // Strings
  ['E', 'A', 'D', 'G', 'B', 'e'].forEach((name, s) => {
    parts.push(`<line class="string" x1="${left}" y1="${y(s)}" x2="${left + cols * cell}" y2="${y(s)}" />`);
    parts.push(`<text class="string-name" x="12" y="${y(s) + 4}">${name}</text>`);
  });
  // The scale, faint
  const played = new Set(analysis.notes.map((n) => `${n.string}:${n.fret}`));
  for (let s = 0; s < 6; s += 1) {
    for (let f = lo; f <= hi; f += 1) {
      const pc = (STRING_PCS[s] + f) % 12;
      const rel = (((pc - rootPc) % 12) + 12) % 12;
      if (!analysis.scale.intervals.includes(rel) || played.has(`${s}:${f}`)) continue;
      const role = rel === 0 ? 'root' : 'scale';
      parts.push(`<g class="dot ghost ${role}"><circle cx="${x(f)}" cy="${y(s)}" r="9" /><text x="${x(f)}" y="${y(s) + 3.5}">${esc(label(pc))}</text></g>`);
    }
  }
  // The lick
  const seen = new Map();
  for (const n of analysis.notes) {
    if (n.string < 0 || n.string > 5 || n.fret < lo || n.fret > hi) continue;
    const key = `${n.string}:${n.fret}`;
    const entry = seen.get(key) || { ...n, bars: new Set(), bent: false, picked: false };
    entry.bars.add(n.bar);
    entry.picked = entry.picked || picked.has(n.index);
    entry.bent = entry.bent || n.bendTo != null;
    seen.set(key, entry);
  }
  for (const n of seen.values()) {
    const role = noteRole(n.degree, analysis);
    const now = bar == null || n.bars.has(bar);
    const cls = `dot lick ${role}${now ? '' : ' dim'}${bar != null && now ? ' now' : ''}${n.picked ? ' picked' : ''}`;
    const bend = n.bent ? `<text class="bend" x="${x(n.fret) + 13}" y="${y(n.string) - 8}">↗</text>` : '';
    parts.push(`<g class="${cls}" data-pos="${n.string}:${n.fret}" tabindex="0" role="button" aria-label="${['E', 'A', 'D', 'G', 'B', 'e'][n.string]} string fret ${n.fret}, the ${esc(n.degree)}"><circle cx="${x(n.fret)}" cy="${y(n.string)}" r="11" /><text x="${x(n.fret)}" y="${y(n.string) + 4}">${esc(label(n.pc))}</text>${bend}</g>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
