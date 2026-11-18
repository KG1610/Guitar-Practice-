import { describe, expect, it } from 'vitest';
import { awakeHolders, keepAwake, primeMedia } from '../src/device.js';

describe('keepAwake', () => {
  it('tracks who wants the screen on and lets go when nobody does', () => {
    keepAwake('desk', true);
    keepAwake('session', true);
    keepAwake('desk', false);
    expect(awakeHolders()).toEqual(['session']);
    keepAwake('session', false);
    expect(awakeHolders()).toEqual([]);
  });
});

describe('primeMedia', () => {
  it('does nothing off iOS', () => {
    let played = false;
    expect(primeMedia({ play() { played = true; }, pause() {} })).toBe(false);
    expect(played).toBe(false);
  });
});
