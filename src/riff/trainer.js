/**
 * Speed builder for the Riff Room loop: start slow, step up after a few clean
 * loops, stop at the target. "Back off" is the honest-player button: drop one
 * step and start counting again.
 *
 * Speeds are playback rates (0.5 = 50%). Everything here is pure so it can be
 * unit tested; room.js owns the video and the UI.
 */

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 1;

export const TRAINER_DEFAULTS = Object.freeze({
  enabled: false,
  start: 0.5,
  step: 0.05,
  every: 4,
  target: 1,
  fadeGuitar: false,
});

/** How much the guitar part drops each step once the target speed is reached. */
export const FADE_STEP = 0.25;

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** Round to whole percent so repeated steps do not drift (0.5 + 0.05 * 3). */
export function roundSpeed(value) {
  return Math.round(value * 100) / 100;
}

/** Fill gaps and clamp a saved or user-typed trainer config. */
export function cleanTrainer(raw = {}) {
  const num = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);
  const start = roundSpeed(clamp(num(raw.start, TRAINER_DEFAULTS.start), MIN_SPEED, MAX_SPEED));
  const target = roundSpeed(clamp(num(raw.target, TRAINER_DEFAULTS.target), start, MAX_SPEED));
  return {
    enabled: Boolean(raw.enabled),
    start,
    step: roundSpeed(clamp(num(raw.step, TRAINER_DEFAULTS.step), 0.01, 0.25)),
    every: Math.round(clamp(num(raw.every, TRAINER_DEFAULTS.every), 1, 32)),
    target,
    fadeGuitar: Boolean(raw.fadeGuitar),
  };
}

/** Run state when the builder is switched on. */
export function trainerBegin(settings) {
  return { speed: settings.start, loops: 0 };
}

/**
 * One full pass of the loop finished. Returns the next run state plus whether
 * the speed went up and whether the target is reached.
 */
export function trainerAfterLoop(settings, run) {
  const atTarget = run.speed >= settings.target;
  if (atTarget) return { speed: run.speed, loops: run.loops + 1, stepped: false, done: true };
  const loops = run.loops + 1;
  if (loops < settings.every) return { speed: run.speed, loops, stepped: false, done: false };
  const speed = roundSpeed(Math.min(settings.target, run.speed + settings.step));
  return { speed, loops: 0, stepped: true, done: speed >= settings.target };
}

/**
 * After a loop at the target speed: with fadeGuitar on, drop the guitar part
 * one step every `every` loops until it is gone. Returns the new volume.
 * `run` is the state returned by trainerAfterLoop for this loop.
 */
export function guitarAfterLoop(settings, run, volume) {
  if (!settings.fadeGuitar || run.speed < settings.target) return volume;
  if (run.loops === 0 || run.loops % settings.every !== 0) return volume;
  return roundSpeed(Math.max(0, volume - FADE_STEP));
}

/** Missed it: one step slower (never below the floor) and count again. */
export function trainerBackOff(settings, run) {
  return { speed: roundSpeed(Math.max(MIN_SPEED, run.speed - settings.step)), loops: 0 };
}
