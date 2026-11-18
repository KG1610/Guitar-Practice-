const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const ALIAS = { Db: 'C#', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb' };

export function keyToFretboard(name) {
  if (!name) return null;
  const [raw, mode] = name.split(/\s+/);
  if (!raw || !mode) return null;
  const canon = ALIAS[raw] || raw;
  const rootPc = NAMES.indexOf(canon);
  if (rootPc < 0) return null;
  return {
    rootPc,
    scaleId: mode === 'minor' ? 'natural-minor' : 'major',
    patternId: 'all',
  };
}
