import { state } from './glory-state.js';

export function stepsPerBar() {
  return state.pattern?.stepsPerBar ?? 16;
}

export function syllablesFor(spb) {
  if (spb === 16) return ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
  if (spb === 8) return ['1', '&', '2', '&', '3', '&', '4', '&'];
  return Array.from({ length: spb }, (_, i) => String(i + 1));
}

export function formBars() {
  const pattern = state.pattern;
  if (pattern?.form?.length) return pattern.form;
  if (pattern?.tracksByBar?.length) return pattern.tracksByBar;
  if (pattern?.tracks) {
    return [{
      label: 'Bar 1',
      kick: pattern.tracks.kick,
      snare: pattern.tracks.snare,
      hat: pattern.tracks.hat,
    }];
  }
  return [];
}

export function formLength() {
  return Math.max(1, formBars().length);
}

export function isMultiBar() {
  return formLength() > 1;
}

export function currentBar() {
  const bars = formBars();
  if (!bars.length) return null;
  return bars[state.barIndex % bars.length];
}

export function currentTracks() {
  const bar = currentBar();
  if (!bar) return state.pattern?.tracks ?? {};
  return { kick: bar.kick, snare: bar.snare, hat: bar.hat };
}
