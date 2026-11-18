/**
 * Turn alphaTex into a flat list of notes using alphaTab's own parser, so the
 * pitches come from the same model the playable tab renders (tuning included).
 */
import * as alphaTab from '@coderline/alphatab';

const TICKS_PER_QUARTER = 960;

/**
 * @returns {{ notes: Array<{
 *   bar: number,      // 0-based bar index
 *   beat: number,     // quarter notes from the start of the bar
 *   string: number,   // 0 = low E … 5 = high e (6-string)
 *   fret: number,
 *   midi: number,
 *   pc: number,       // pitch class 0–11 (C = 0)
 *   bendTo: number|null, // pitch class the note is bent up to, if bent
 *   index: number,    // position among all notes in the tex (texedit.js)
 * }>, total: number, barCount: number, error: string|null }}
 */
export function notesFromTex(tex) {
  if (!tex || !tex.trim()) return { notes: [], barCount: 0, error: null };
  let score;
  try {
    const importer = new alphaTab.importer.AlphaTexImporter();
    importer.initFromString(tex, new alphaTab.Settings());
    score = importer.readScore();
  } catch (err) {
    return { notes: [], barCount: 0, error: String(err?.message || err) };
  }
  const staff = score?.tracks?.[0]?.staves?.[0];
  if (!staff) return { notes: [], barCount: 0, error: null };
  const strings = staff.tuning?.length || 6;
  const notes = [];
  let index = -1; // every note in source order, dead notes included (see texedit.js)
  let total = 0;
  for (const bar of staff.bars) {
    const voice = bar.voices[0];
    if (!voice) continue;
    for (const beat of voice.beats) {
      if (beat.isRest) continue;
      for (const note of beat.notes) {
        index += 1;
        total += 1;
        if (note.isDead || !Number.isFinite(note.realValue)) continue;
        const peak = note.hasBend && note.bendPoints?.length
          ? Math.max(...note.bendPoints.map((p) => p.value))
          : 0;
        // Bend values are quarter tones: 4 = full bend = 2 semitones.
        const bendSemis = Math.round(peak / 2);
        const pc = ((note.realValue % 12) + 12) % 12;
        notes.push({
          index,
          bar: bar.index,
          beat: beat.playbackStart / TICKS_PER_QUARTER,
          // alphaTab numbers strings from the lowest (1) up.
          string: note.string - 1 - (strings - 6),
          fret: note.fret,
          midi: note.realValue,
          pc,
          bendTo: bendSemis > 0 ? (pc + bendSemis) % 12 : null,
        });
      }
    }
  }
  return { notes, total, barCount: staff.bars.length, error: null };
}
