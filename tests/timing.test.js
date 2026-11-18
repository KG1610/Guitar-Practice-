import { describe, expect, it } from 'vitest';
import { barStart, countInBeats, loopRegion } from '../src/riff/timing.js';

describe('barStart', () => {
  it('maps bars to media time from the downbeat offset', () => {
    expect(barStart(1, 80, -2.6)).toBeCloseTo(-2.6);
    expect(barStart(3, 80, -2.6)).toBeCloseTo(-2.6 + 6);
  });
});

describe('loopRegion', () => {
  it('uses A–B when valid, else the whole clip', () => {
    expect(loopRegion(2, 5, 26)).toEqual({ start: 2, end: 5, ab: true });
    expect(loopRegion(5, 2, 26)).toEqual({ start: 0, end: 26, ab: false });
    expect(loopRegion(null, 4, 26).ab).toBe(false);
  });
});

describe('countInBeats', () => {
  it('lands the last click one beat before a downbeat start', () => {
    const beats = countInBeats(8);
    expect(beats.map((b) => b.beat)).toEqual([4, 5, 6, 7]);
    expect(beats.map((b) => b.before)).toEqual([4, 3, 2, 1]);
    expect(beats[0].accent).toBe(true);
  });

  it('stays on the grid when the loop starts mid-beat', () => {
    const beats = countInBeats(8.5);
    expect(beats.map((b) => b.beat)).toEqual([5, 6, 7, 8]);
    expect(beats[3].before).toBeCloseTo(0.5);
    expect(beats.find((b) => b.accent).beat).toBe(8);
  });

  it('works before bar 1 (negative beats)', () => {
    const beats = countInBeats(-0.6);
    expect(beats.map((b) => b.beat)).toEqual([-4, -3, -2, -1]);
    expect(beats[0].accent).toBe(true);
  });
});
