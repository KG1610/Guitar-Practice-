/**
 * A practice session: warm-up → riff → theory → jam, each with a timer.
 * Pure logic (plan, warm-up of the day, the countdown) so it can be tested;
 * session/ui.js drives the screen.
 */

export const BLOCKS = {
  warmup: { id: 'warmup', name: 'Warm-up', view: 'desk' },
  riff: { id: 'riff', name: 'Riff', view: 'riff' },
  theory: { id: 'theory', name: 'Theory', view: 'riff' },
  jam: { id: 'jam', name: 'Jam', view: 'desk' },
};

export const DEFAULT_PLAN = [
  { id: 'warmup', minutes: 5, on: true },
  { id: 'riff', minutes: 15, on: true },
  { id: 'theory', minutes: 5, on: true },
  { id: 'jam', minutes: 10, on: true },
];

/** Keep the four blocks in order; clamp minutes to 1–60. */
export function cleanPlan(raw) {
  const given = Array.isArray(raw) ? raw : [];
  return DEFAULT_PLAN.map((block) => {
    const saved = given.find((b) => b && b.id === block.id) || {};
    const minutes = Math.round(Number(saved.minutes));
    return {
      id: block.id,
      minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(60, minutes) : block.minutes,
      on: typeof saved.on === 'boolean' ? saved.on : block.on,
    };
  });
}

export function planMinutes(plan) {
  return plan.filter((b) => b.on).reduce((sum, b) => sum + b.minutes, 0);
}

/** Original warm-ups. One a day, in rotation. */
export const WARMUPS = [
  {
    name: 'Chromatic 1-2-3-4',
    text: 'One finger per fret, 1-2-3-4 on each string from low E to high e, then back down. Alternate picking in 16ths. Move up one fret each time round.',
    patternId: 'drill-16ths',
    bpm: 70,
  },
  {
    name: 'Spider 1-3-2-4',
    text: 'Fingers 1-3-2-4 across each string, low E to high e and back. Keep the fingers you are not using hovering just above the strings.',
    patternId: 'drill-16ths',
    bpm: 60,
  },
  {
    name: 'Pentatonic box, saying the degrees',
    text: 'Box 1 of the riff\'s key, up and down in 8ths, then 16ths. Every time you hit a root, say "one" out loud; then try saying every degree.',
    patternId: 'drill-8ths',
    bpm: 80,
    useRiffKey: true,
  },
  {
    name: 'Palm-muted chug',
    text: 'Low E palm-muted 16ths, accent the first note of each beat. Keep the picking hand loose and the mute just in front of the bridge.',
    patternId: 'chug-16th',
    bpm: 90,
  },
  {
    name: 'String skipping',
    text: 'Pentatonic box 1, skipping a string each time: low E to D, A to G, D to B, G to high e, then back. 8ths, clean and even.',
    patternId: 'drill-8ths',
    bpm: 70,
    useRiffKey: true,
  },
];

export function warmupFor(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return WARMUPS[((day % WARMUPS.length) + WARMUPS.length) % WARMUPS.length];
}

// ---- The countdown -------------------------------------------------------
// state: { blocks: [{ id, minutes }], index, endsAt, pausedLeft, practisedMs, done }

export function startSession(plan, now) {
  const blocks = plan.filter((b) => b.on).map((b) => ({ id: b.id, minutes: b.minutes }));
  if (!blocks.length) return null;
  return { blocks, index: 0, endsAt: now + blocks[0].minutes * 60000, pausedLeft: null, practisedMs: 0, done: false, blockStart: now };
}

export function timeLeft(s, now) {
  if (!s || s.done) return 0;
  return s.pausedLeft != null ? s.pausedLeft : Math.max(0, s.endsAt - now);
}

export function isPaused(s) {
  return Boolean(s && s.pausedLeft != null);
}

export function pauseSession(s, now) {
  if (!s || s.done || isPaused(s)) return s;
  return { ...s, pausedLeft: timeLeft(s, now), practisedMs: s.practisedMs + (now - s.blockStart), endsAt: null };
}

export function resumeSession(s, now) {
  if (!s || !isPaused(s)) return s;
  return { ...s, endsAt: now + s.pausedLeft, pausedLeft: null, blockStart: now };
}

export function addMinute(s, now) {
  if (!s || s.done) return s;
  if (isPaused(s)) return { ...s, pausedLeft: s.pausedLeft + 60000 };
  return { ...s, endsAt: Math.max(s.endsAt, now) + 60000 };
}

/** Move to the next block (or finish). Time actually spent is added up. */
export function nextBlock(s, now) {
  if (!s || s.done) return s;
  const spent = isPaused(s) ? 0 : now - s.blockStart;
  const practisedMs = s.practisedMs + spent;
  const index = s.index + 1;
  if (index >= s.blocks.length) return { ...s, practisedMs, done: true, endsAt: null, pausedLeft: null };
  return { ...s, index, practisedMs, endsAt: now + s.blocks[index].minutes * 60000, pausedLeft: null, blockStart: now };
}

export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
