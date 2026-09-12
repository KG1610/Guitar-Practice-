import * as Tone from 'tone';

export function createAudio() {
  const kitGain = new Tone.Gain(1).toDestination();
  const clickGain = new Tone.Gain(0.9).toDestination();
  const riffGain = new Tone.Gain(0).toDestination();

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.08 },
  }).connect(kitGain);

  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.04 },
  }).connect(kitGain);
  snareNoise.volume.value = -10;

  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.04 },
  }).connect(kitGain);
  snareBody.volume.value = -7;

  const hat = new Tone.MetalSynth({
    frequency: 280,
    envelope: { attack: 0.001, decay: 0.07, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  }).connect(kitGain);
  hat.volume.value = -20;

  const click = new Tone.MembraneSynth({
    pitchDecay: 0.004,
    octaves: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
  }).connect(clickGain);
  click.volume.value = -6;

  const riffSynth = new Tone.DuoSynth({
    harmonicity: 1.001,
    vibratoAmount: 0,
    vibratoRate: 0.1,
    voice0: {
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
      filterEnvelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02, baseFrequency: 80, octaves: 1.2 },
    },
    voice1: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
      filterEnvelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02, baseFrequency: 60, octaves: 1 },
    },
  }).connect(riffGain);
  riffSynth.volume.value = -14;

  return { kitGain, clickGain, riffGain, kick, snareNoise, snareBody, hat, click, riffSynth };
}
