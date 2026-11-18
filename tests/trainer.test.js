import { describe, expect, it } from 'vitest';
import {
  MIN_SPEED, cleanTrainer, trainerAfterLoop, trainerBackOff, trainerBegin,
} from '../src/riff/trainer.js';

const settings = cleanTrainer({ enabled: true, start: 0.5, step: 0.05, every: 4, target: 0.7 });

function runLoops(run, n) {
  let next = run;
  for (let i = 0; i < n; i += 1) next = trainerAfterLoop(settings, next);
  return next;
}

describe('speed builder', () => {
  it('starts at the start speed with no loops counted', () => {
    expect(trainerBegin(settings)).toEqual({ speed: 0.5, loops: 0 });
  });

  it('holds speed until `every` loops, then steps up and resets the count', () => {
    const run = trainerBegin(settings);
    expect(runLoops(run, 3)).toMatchObject({ speed: 0.5, loops: 3, stepped: false });
    expect(runLoops(run, 4)).toMatchObject({ speed: 0.55, loops: 0, stepped: true });
  });

  it('does not drift with float steps and stops exactly on target', () => {
    const after = runLoops(trainerBegin(settings), 16);
    expect(after.speed).toBe(0.7);
    expect(after.done).toBe(true);
    expect(runLoops(after, 8).speed).toBe(0.7);
  });

  it('never overshoots a target that is not a whole number of steps away', () => {
    const odd = cleanTrainer({ start: 0.5, step: 0.15, every: 1, target: 0.6 });
    expect(trainerAfterLoop(odd, trainerBegin(odd))).toMatchObject({ speed: 0.6, done: true });
  });

  it('backs off one step, not below the floor, and restarts the count', () => {
    expect(trainerBackOff(settings, { speed: 0.6, loops: 3 })).toEqual({ speed: 0.55, loops: 0 });
    expect(trainerBackOff(settings, { speed: MIN_SPEED, loops: 1 }).speed).toBe(MIN_SPEED);
  });
});

describe('cleanTrainer', () => {
  it('fills defaults and clamps silly input', () => {
    expect(cleanTrainer({})).toEqual({ enabled: false, start: 0.5, step: 0.05, every: 4, target: 1 });
    const wild = cleanTrainer({ start: 0.05, step: 3, every: 0, target: 9 });
    expect(wild).toMatchObject({ start: MIN_SPEED, step: 0.25, every: 1, target: 1 });
  });

  it('keeps the target at or above the start', () => {
    expect(cleanTrainer({ start: 0.8, target: 0.6 }).target).toBe(0.8);
  });
});
