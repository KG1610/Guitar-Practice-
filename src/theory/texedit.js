/**
 * Find and rewrite single notes in alphaTex text, keeping everything else
 * (durations, effects in {...}, chords, bars) exactly as written.
 *
 * Notes are `fret.string` with an optional `.duration` (`5.3`, `7.2.8`,
 * `x.4` for a dead note, `-.3` for a tie). They are counted in source order,
 * which is the order alphaTab reads them, so token i is note i in
 * notesFromTex() (its `index` field). Use texNotesMatch() before editing.
 */

const NOTE = /(\d+|x|-)\.(\d+)(\.\d+)?/y;

/** Where the music starts: after the metadata terminator line ".", if any. */
function bodyStart(tex) {
  const match = /^[ \t]*\.[ \t]*$/m.exec(tex);
  return match ? match.index + match[0].length : 0;
}

/**
 * @returns {Array<{ start: number, end: number, fret: string, string: number }>}
 *   start/end cover `fret.string` only; a `.duration` suffix stays outside.
 */
export function noteTokens(tex) {
  const tokens = [];
  if (!tex) return tokens;
  let i = bodyStart(tex);
  let depth = 0;
  while (i < tex.length) {
    const ch = tex[i];
    if (ch === '"') { // string literal
      const close = tex.indexOf('"', i + 1);
      i = close < 0 ? tex.length : close + 1;
      continue;
    }
    if (ch === '/' && tex[i + 1] === '/') { // line comment
      const nl = tex.indexOf('\n', i);
      i = nl < 0 ? tex.length : nl + 1;
      continue;
    }
    if (ch === '/' && tex[i + 1] === '*') { // block comment
      const close = tex.indexOf('*/', i + 2);
      i = close < 0 ? tex.length : close + 2;
      continue;
    }
    if (ch === '\\') { // metadata or a command such as \ts (4 4): skip the word
      i += 1;
      while (i < tex.length && /[A-Za-z]/.test(tex[i])) i += 1;
      continue;
    }
    if (ch === '{') { depth += 1; i += 1; continue; }
    if (ch === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && !/[\w.]/.test(tex[i - 1] ?? ' ')) {
      NOTE.lastIndex = i;
      const m = NOTE.exec(tex);
      if (m) {
        const end = i + m[1].length + 1 + m[2].length;
        tokens.push({ start: i, end, fret: m[1], string: Number(m[2]) });
        i += m[0].length;
        continue;
      }
    }
    i += 1;
  }
  return tokens;
}

/** True when the tokens line up one-to-one with alphaTab's notes. */
export function texNotesMatch(tex, noteCount) {
  return noteTokens(tex).length === noteCount;
}

/**
 * Replace notes by index. `string` is 0 = low E … 5 = high e (the app's
 * numbering); alphaTex counts 1 = high e … 6 = low E.
 */
export function replaceNotes(tex, indexes, { fret, string }) {
  const tokens = noteTokens(tex);
  const picked = [...new Set(indexes)]
    .filter((i) => tokens[i])
    .sort((a, b) => tokens[b].start - tokens[a].start); // edit from the end
  let out = tex;
  for (const i of picked) {
    const t = tokens[i];
    const texString = 6 - string;
    out = `${out.slice(0, t.start)}${Math.max(0, Math.round(fret))}.${texString}${out.slice(t.end)}`;
  }
  return out;
}
