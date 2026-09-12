import * as Tone from 'tone';
import index from './patterns/index.json';
import rockBasic from './patterns/rock-basic.json';
import popFour from './patterns/pop-four.json';
import balladSoft from './patterns/ballad-soft.json';
import shuffleFeel from './patterns/shuffle-feel.json';
import drillQuarters from './patterns/drill-quarters.json';
import drill8ths from './patterns/drill-8ths.json';
import drill16ths from './patterns/drill-16ths.json';
import drillWheel from './patterns/drill-wheel.json';

const catalog = {
  'rock-basic': rockBasic,
  'pop-four': popFour,
  'ballad-soft': balladSoft,
  'shuffle-feel': shuffleFeel,
  'drill-quarters': drillQuarters,
  'drill-8ths': drill8ths,
  'drill-16ths': drill16ths,
  'drill-wheel': drillWheel,
};

const playBtn = document.getElementById('play');
const bpmInput = document.getElementById('bpm');
const bpmValue = document.getElementById('bpm-value');
const statusEl = document.getElementById('status');
const patternSelect = document.getElementById('pattern-select');
const patternDesc = document.getElementById('pattern-desc');
const wheelLabel = document.getElementById('wheel-label');
const beatDots = document.getElementById('beat-dots');
const rampEnabled = document.getElementById('ramp-enabled');
const rampStart = document.getElementById('ramp-start');
const rampTarget = document.getElementById('ramp-target');
const rampBars = document.getElementById('ramp-bars');
const rampStep = document.getElementById('ramp-step');
const genInput = document.getElementById('gen-input');
const genBtn = document.getElementById('gen-btn');
const genStatus = document.getElementById('gen-status');

let pattern = null;
let playing = false;
let step = 0;
let barIndex = 0;
let barsSinceRamp = 0;
let loop = null;

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

function stepsPerBar() {
  return pattern?.stepsPerBar ?? 8;
}

function currentTracks() {
  if (pattern?.wheel && pattern.tracksByBar?.length) {
    return pattern.tracksByBar[barIndex % pattern.tracksByBar.length];
  }
  return pattern.tracks;
}

function setBpm(bpm) {
  const n = Math.max(50, Math.min(180, Number(bpm) || 90));
  Tone.getTransport().bpm.value = n;
  bpmInput.value = String(Math.round(n));
  bpmValue.textContent = String(Math.round(n));
}

function rebuildDots() {
  beatDots.innerHTML = '';
  for (let i = 0; i < 4; i += 1) {
    beatDots.appendChild(document.createElement('span'));
  }
}

function highlightBeat(stepIndex) {
  const spb = stepsPerBar();
  const beat = Math.floor((stepIndex / spb) * 4) % 4;
  [...beatDots.children].forEach((el, i) => {
    el.classList.toggle('on', i === beat);
  });
}

function updateWheelLabel() {
  if (pattern?.wheel && pattern.tracksByBar?.length) {
    const slice = pattern.tracksByBar[barIndex % pattern.tracksByBar.length];
    wheelLabel.hidden = false;
    wheelLabel.textContent = `Wheel bar: ${slice.label}`;
  } else {
    wheelLabel.hidden = true;
    wheelLabel.textContent = '';
  }
}

function triggerStep(time, stepIndex) {
  const tracks = currentTracks();
  if (tracks.kick?.[stepIndex]) kick.triggerAttackRelease('C1', '8n', time);
  if (tracks.snare?.[stepIndex]) {
    snareNoise.triggerAttackRelease('8n', time);
    snareBody.triggerAttackRelease('G2', '16n', time);
  }
  if (tracks.hat?.[stepIndex]) {
    hat.triggerAttackRelease('32n', time, undefined, 0.35);
  }
  Tone.getDraw().schedule(() => {
    highlightBeat(stepIndex);
    updateWheelLabel();
  }, time);
}

function maybeRamp() {
  if (!rampEnabled.checked || !playing) return;
  const every = Math.max(1, Number(rampBars.value) || 2);
  const delta = Math.max(1, Number(rampStep.value) || 5);
  const target = Number(rampTarget.value) || 110;
  barsSinceRamp += 1;
  if (barsSinceRamp < every) return;
  barsSinceRamp = 0;
  const next = Math.min(target, Tone.getTransport().bpm.value + delta);
  setBpm(next);
  statusEl.textContent =
    next >= target
      ? `Playing · ramp hit ${Math.round(target)} BPM`
      : `Playing · ${Math.round(next)} BPM`;
}

function ensureLoop() {
  if (loop) {
    loop.dispose();
    loop = null;
  }
  const subdivision = stepsPerBar() === 16 ? '16n' : '8n';
  loop = new Tone.Loop((time) => {
    triggerStep(time, step);
    step += 1;
    if (step >= stepsPerBar()) {
      step = 0;
      barIndex += 1;
      maybeRamp();
    }
  }, subdivision);
}

function loadPatternById(id) {
  const next = catalog[id];
  if (!next) throw new Error(`Unknown pattern: ${id}`);
  pattern = next;
  patternSelect.value = id;
  patternDesc.textContent = pattern.description || '';
  setBpm(pattern.bpmDefault ?? 90);
  barIndex = 0;
  step = 0;
  barsSinceRamp = 0;
  rebuildDots();
  updateWheelLabel();
  if (playing) {
    ensureLoop();
    loop.start(0);
  }
}

function fillSelect() {
  patternSelect.innerHTML = '';
  for (const item of index) {
    const opt = document.createElement('option');
    opt.value = item.id;
    const data = catalog[item.id];
    opt.textContent = data?.name || item.id;
    patternSelect.appendChild(opt);
  }
}

function parseGenerate(text) {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const bpmMatch = q.match(/(\d{2,3})\s*bpm|\b(\d{2,3})\b/);
  const bpm = bpmMatch ? Number(bpmMatch[1] || bpmMatch[2]) : null;

  let id = 'rock-basic';
  if (/ballad|slow|soft/.test(q)) id = 'ballad-soft';
  else if (/pop|four|4.?floor/.test(q)) id = 'pop-four';
  else if (/shuffle|swing/.test(q)) id = 'shuffle-feel';
  else if (/wheel/.test(q)) id = 'drill-wheel';
  else if (/16|sixteenth/.test(q)) id = 'drill-16ths';
  else if (/8th|eighth/.test(q)) id = 'drill-8ths';
  else if (/quarter|pulse|click/.test(q)) id = 'drill-quarters';
  else if (/drill/.test(q)) id = 'drill-8ths';
  else if (/rock|strum/.test(q)) id = 'rock-basic';

  return { id, bpm };
}

async function start() {
  if (!pattern) loadPatternById(patternSelect.value || index[0].id);
  await Tone.start();
  if (rampEnabled.checked) setBpm(Number(rampStart.value) || pattern.bpmDefault || 90);
  else setBpm(Number(bpmInput.value));
  step = 0;
  barIndex = 0;
  barsSinceRamp = 0;
  Tone.getTransport().position = 0;
  ensureLoop();
  loop.start(0);
  Tone.getTransport().start();
  playing = true;
  playBtn.textContent = 'Stop';
  playBtn.setAttribute('aria-pressed', 'true');
  statusEl.textContent = 'Playing';
  updateWheelLabel();
}

function stop() {
  Tone.getTransport().stop();
  if (loop) loop.stop();
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

bpmInput.addEventListener('input', () => setBpm(Number(bpmInput.value)));

patternSelect.addEventListener('change', async () => {
  const wasPlaying = playing;
  if (wasPlaying) stop();
  loadPatternById(patternSelect.value);
  if (wasPlaying) await start();
});

genBtn.addEventListener('click', () => {
  const parsed = parseGenerate(genInput.value);
  if (!parsed) {
    genStatus.textContent = 'Try: 90 rock · slow ballad · 16th drill · wheel';
    return;
  }
  loadPatternById(parsed.id);
  if (parsed.bpm) setBpm(parsed.bpm);
  genStatus.textContent = `Loaded ${pattern.name}${parsed.bpm ? ` @ ${parsed.bpm} BPM` : ''}`;
});

genInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') genBtn.click();
});

fillSelect();
loadPatternById(index[0].id);
