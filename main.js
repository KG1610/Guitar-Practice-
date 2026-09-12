import * as Tone from 'tone';
import rockBasic from './patterns/rock-basic.json';

const playBtn = document.getElementById('play');
const bpmInput = document.getElementById('bpm');
const bpmValue = document.getElementById('bpm-value');
const statusEl = document.getElementById('status');
const patternName = document.getElementById('pattern-name');
const patternDesc = document.getElementById('pattern-desc');
const beatDots = document.getElementById('beat-dots');

const pattern = rockBasic;
patternName.textContent = pattern.name;
patternDesc.textContent = pattern.description;
bpmInput.value = String(pattern.bpmDefault ?? 90);
bpmValue.textContent = bpmInput.value;

const stepsPerBar = pattern.stepsPerBar ?? 8;
for (let i = 0; i < 4; i += 1) {
  const dot = document.createElement('span');
  beatDots.appendChild(dot);
}

/** Synth kit — sounds like drums, no sample license issues. */
const kick = new Tone.MembraneSynth({
  pitchDecay: 0.03,
  octaves: 5,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
}).toDestination();

const snareNoise = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 },
}).toDestination();
snareNoise.volume.value = -8;

const snareBody = new Tone.MembraneSynth({
  pitchDecay: 0.01,
  octaves: 2,
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
}).toDestination();
snareBody.volume.value = -6;

const hat = new Tone.MetalSynth({
  frequency: 280,
  envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
  harmonicity: 5.1,
  modulationIndex: 32,
  resonance: 4000,
  octaves: 1.5,
}).toDestination();
hat.volume.value = -18;

let playing = false;
let step = 0;

function setBpm(bpm) {
  Tone.getTransport().bpm.value = bpm;
  bpmValue.textContent = String(bpm);
}

function highlightBeat(stepIndex) {
  const beat = Math.floor(stepIndex / (stepsPerBar / 4)) % 4;
  [...beatDots.children].forEach((el, i) => {
    el.classList.toggle('on', i === beat);
  });
}

function triggerStep(time, stepIndex) {
  const tracks = pattern.tracks;
  if (tracks.kick?.[stepIndex]) {
    kick.triggerAttackRelease('C1', '8n', time);
  }
  if (tracks.snare?.[stepIndex]) {
    snareNoise.triggerAttackRelease('8n', time);
    snareBody.triggerAttackRelease('G2', '16n', time);
  }
  if (tracks.hat?.[stepIndex]) {
    hat.triggerAttackRelease('32n', time, undefined, 0.35);
  }
  Tone.getDraw().schedule(() => highlightBeat(stepIndex), time);
}

const loop = new Tone.Loop((time) => {
  triggerStep(time, step);
  step = (step + 1) % stepsPerBar;
}, '8n');

async function start() {
  await Tone.start();
  setBpm(Number(bpmInput.value));
  step = 0;
  Tone.getTransport().position = 0;
  loop.start(0);
  Tone.getTransport().start();
  playing = true;
  playBtn.textContent = 'Stop';
  playBtn.setAttribute('aria-pressed', 'true');
  statusEl.textContent = 'Playing';
}

function stop() {
  Tone.getTransport().stop();
  loop.stop();
  playing = false;
  playBtn.textContent = 'Play';
  playBtn.setAttribute('aria-pressed', 'false');
  statusEl.textContent = 'Stopped';
  [...beatDots.children].forEach((el) => el.classList.remove('on'));
}

playBtn.addEventListener('click', async () => {
  if (playing) stop();
  else await start();
});

bpmInput.addEventListener('input', () => {
  setBpm(Number(bpmInput.value));
});

setBpm(Number(bpmInput.value));
