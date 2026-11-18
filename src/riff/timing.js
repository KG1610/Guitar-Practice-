/**
 * Media-time ↔ bar/beat maths for the Riff Room. The grid is defined by the
 * riff's BPM and its downbeat offset (the media time of bar 1, beat 1), in
 * video seconds, so it is independent of playback speed.
 */

export const BEATS_PER_BAR = 4;

export function beatSeconds(bpm) {
  return 60 / (bpm > 0 ? bpm : 80);
}

/** Media time where bar `bar` (1-based) starts. */
export function barStart(bar, bpm, offset = 0) {
  return offset + (bar - 1) * BEATS_PER_BAR * beatSeconds(bpm);
}

/**
 * Loop region for the current settings. An A–B pair wins when it is valid;
 * otherwise the whole clip.
 */
export function loopRegion(loopA, loopB, duration) {
  const ab = loopA != null && loopB != null && loopB > loopA;
  if (ab) return { start: Math.max(0, loopA), end: loopB, ab: true };
  return { start: 0, end: Number.isFinite(duration) && duration > 0 ? duration : Infinity, ab: false };
}

/**
 * Grid beats for a count-in that leads into media beat position `startBeat`.
 * Returns `count` integer beat numbers, all strictly before `startBeat`, the
 * last one being the beat just before it. Each entry says how many beats
 * before the start it falls, so the caller can schedule it in wall time.
 */
export function countInBeats(startBeat, count = BEATS_PER_BAR) {
  const first = Math.ceil(startBeat) - count;
  const out = [];
  for (let k = 0; k < count; k += 1) {
    const beat = first + k;
    out.push({
      beat,
      before: startBeat - beat,
      accent: ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0,
    });
  }
  return out;
}
