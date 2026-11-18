import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAN, WARMUPS, addMinute, cleanPlan, formatClock, isPaused, nextBlock, pauseSession,
  planMinutes, resumeSession, startSession, timeLeft, warmupFor,
} from '../src/session/plan.js';

const MIN = 60000;

describe('plan', () => {
  it('keeps the four blocks in order and clamps minutes', () => {
    const plan = cleanPlan([{ id: 'jam', minutes: 90, on: false }, { id: 'riff', minutes: 'x' }, { id: 'bogus' }]);
    expect(plan.map((b) => b.id)).toEqual(['warmup', 'riff', 'theory', 'jam']);
    expect(plan[1].minutes).toBe(15);
    expect(plan[3]).toEqual({ id: 'jam', minutes: 60, on: false });
    expect(planMinutes(DEFAULT_PLAN)).toBe(35);
  });

  it('rotates one warm-up a day', () => {
    const a = warmupFor(new Date(2026, 10, 18));
    const b = warmupFor(new Date(2026, 10, 19));
    expect(a).not.toBe(b);
    expect(warmupFor(new Date(2026, 10, 18 + WARMUPS.length))).toBe(a);
  });
});

describe('countdown', () => {
  const plan = cleanPlan([{ id: 'warmup', minutes: 5 }, { id: 'riff', minutes: 15 }, { id: 'theory', on: false }, { id: 'jam', minutes: 10 }]);

  it('skips blocks that are off and counts down the first one', () => {
    const s = startSession(plan, 0);
    expect(s.blocks.map((b) => b.id)).toEqual(['warmup', 'riff', 'jam']);
    expect(timeLeft(s, 2 * MIN)).toBe(3 * MIN);
    expect(timeLeft(s, 9 * MIN)).toBe(0);
  });

  it('pauses, resumes and adds a minute without losing time', () => {
    let s = startSession(plan, 0);
    s = pauseSession(s, 1 * MIN);
    expect(isPaused(s)).toBe(true);
    expect(timeLeft(s, 50 * MIN)).toBe(4 * MIN);
    s = addMinute(s, 50 * MIN);
    s = resumeSession(s, 50 * MIN);
    expect(timeLeft(s, 51 * MIN)).toBe(4 * MIN);
    s = addMinute(s, 51 * MIN);
    expect(timeLeft(s, 51 * MIN)).toBe(5 * MIN);
  });

  it('moves through the blocks and adds up the time actually spent', () => {
    let s = startSession(plan, 0);
    s = nextBlock(s, 3 * MIN); // left warm-up early
    expect(s.blocks[s.index].id).toBe('riff');
    expect(timeLeft(s, 3 * MIN)).toBe(15 * MIN);
    s = pauseSession(s, 10 * MIN);
    s = resumeSession(s, 20 * MIN); // 10 min break is not practice
    s = nextBlock(s, 22 * MIN);
    s = nextBlock(s, 30 * MIN);
    expect(s.done).toBe(true);
    expect(s.practisedMs).toBe((3 + 7 + 2 + 8) * MIN);
  });

  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(61000)).toBe('1:01');
    expect(formatClock(59001)).toBe('1:00');
  });
});
