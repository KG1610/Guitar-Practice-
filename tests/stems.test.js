import { describe, expect, it } from 'vitest';
import { nudgeFor } from '../src/riff/stems.js';

describe('nudgeFor', () => {
  it('leaves a part alone when it is within 5 ms of the video', () => {
    expect(nudgeFor(0.004)).toBe(1);
    expect(nudgeFor(-0.005)).toBe(1);
  });
  it('slows a part that is ahead and speeds one that is behind', () => {
    expect(nudgeFor(0.03)).toBeCloseTo(0.97);
    expect(nudgeFor(-0.03)).toBeCloseTo(1.03);
  });
  it('caps the nudge at 4%', () => {
    expect(nudgeFor(0.2)).toBeCloseTo(0.96);
    expect(nudgeFor(-0.2)).toBeCloseTo(1.04);
  });
});
