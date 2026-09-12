import * as Tone from 'tone';
import index from './patterns/index.json';

const modules = import.meta.glob('./patterns/*.json', { eager: true, import: 'default' });
const catalog = {};
for (const data of Object.values(modules)) {
  if (data && !Array.isArray(data) && data.id) catalog[data.id] = data;
}

const playBtn = document.getElementById('play');
const bpmInput = document.getElementById('bpm');
const bpmValue = document.getElementById('bpm-value');
const statusEl = document.getElementById('status');
const patternName = document.getElementById('pattern-name');
const patternSub = document.getElementById('pattern-sub');
const beatPads = document.getElementById('beat-pads');
const syllablesEl = document.getElementById('syllables');
const stepGrid = document.getElementById('step-grid');
const trackRows = document.getElementById('track-rows');
const stepSyllable = document.getElementById('step-syllable');
const chipsEl = document.getElementById('pattern-chips');
const volumeInput = document.getElementById('volume');
const countInEl = document.getElementById('count-in');
const rampEnabled = document.getElementById('ramp-enabled');
const rampStart = document.getElementById('ramp-start');
const rampTarget = document.getElementById('ramp-target');
const rampBars = document.getElementById('ramp-bars');
const rampStep = document.getElementById('ramp-step');
const stageEl = document.querySelector('.stage');
const mixBtns = [...document.querySelectorAll('.mix-btn')];

let pattern = null;
let playing = false;
let countingIn = false;
let step = 0;
let barIndex = 0;
let barsSinceRamp = 0;
let loop = null;
let mix = 'both';
let currentId = index[0]?.id ?? 'chug-16th';

const kitGain = new Tone.Gain(1).toDestination();
const clickGain = new Tone.Gain(0.9).toDestination();

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

Tone.getDestination().volume.value = Number(volumeInput.value);

function stepsPerBar() {
  return pattern?.stepsPerBar ?? 16;
}

function syllablesFor(spb) {
  if (spb === 16) return ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
  if (spb === 8) return ['1', '&', '2', '&', '3', '&', '4', '&'];
  return Array.from({ length: spb }, (_, i) => String(i + 1));
}

function currentTracks() {
  if (pattern?.wheel && pattern.tracksByBar?.length) {
    return pattern.tracksByBar[barIndex % pattern.tracksByBar.length];
  }
  return pattern.tracks;
}

function applyMix() {
  const kitOn = mix !== 'click';
  const clickOn = mix !== 'kit';
  kitGain.gain.rampTo(kitOn ? 1 : 0, 0.04);
  clickGain.gain.rampTo(clickOn ? 0.9 : 0, 0.04);
}

function setBpm(bpm) {
  const n = Math.max(50, Math.min(180, Number(bpm) || 90));
  Tone.getTransport().bpm.value = n;
  bpmInput.value = String(Math.round(n));
  bpmValue.textContent = String(Math.round(n));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function rebuildPads() {
  beatPads.innerHTML = '';
  for (let i = 0; i < 4; i += 1) beatPads.appendChild(document.createElement('span'));
}

function rebuildGrid() {
  const spb = stepsPerBar();
  const labels = syllablesFor(spb);
  const cols = `repeat(${spb}, minmax(0, 1fr))`;
  syllablesEl.style.gridTemplateColumns = cols;
  stepGrid.style.gridTemplateColumns = cols;
  syllablesEl.innerHTML = labels
    .map((s, i) => (i % (spb / 4) === 0 ? `<b>${s}</b>` : `<span>${s}</span>`))
    .join('');
  stepGrid.innerHTML = '';
  for (let i = 0; i < spb; i += 1) {
    const cell = document.createElement('span');
    cell.dataset.step = String(i);
    stepGrid.appendChild(cell);
  }
  const tracks = currentTracks() ?? {};
  const names = [
    ['kick', 'Kick'],
    ['snare', 'Snare'],
    ['hat', 'Hat'],
    ['click', 'Click'],
  ];
  trackRows.innerHTML = '';
  for (const [key, label] of names) {
    const row = document.createElement('div');
    row.className = 'track';
    row.innerHTML = `<label>${label}</label><div class="track-hits" style="grid-template-columns:${cols}"></div>`;
    const hits = row.querySelector('.track-hits');
    for (let i = 0; i < spb; i += 1) {
      const dot = document.createElement('i');
      const filled = key === 'click' ? true : Boolean(tracks[key]?.[i]);
      if (filled) dot.classList.add('filled');
      hits.appendChild(dot);
    }
    trackRows.appendChild(row);
  }
}

function highlight(stepIndex) {
  const spb = stepsPerBar();
  const beat = Math.floor((stepIndex / spb) * 4) % 4;
  [...beatPads.children].forEach((el, i) => {
    el.classList.toggle('on', i === beat);
    el.classList.toggle('downbeat', i === beat && beat === 0);
  });
  const labels = syllablesFor(spb);
  stepSyllable.textContent = stepIndex >= 0 ? (labels[stepIndex] ?? '') : labels[0];
  [...stepGrid.children].forEach((el, i) => {
    el.classList.toggle('on', i === stepIndex);
    const tracks = currentTracks() ?? {};
    const any = Boolean(tracks.kick?.[i] || tracks.snare?.[i] || tracks.hat?.[i]);
    el.classList.toggle('hit', any);
  });
  trackRows.querySelectorAll('.track-hits').forEach((row) => {
    [...row.children].forEach((el, i) => el.classList.toggle('on', i === stepIndex));
  });
}

function updateWheelMeta() {
  if (pattern?.wheel && pattern.tracksByBar?.length) {
    const slice = pattern.tracksByBar[barIndex % pattern.tracksByBar.length];
    patternSub.textContent = `${pattern.subtitle ?? 'Subdivision drill'} · ${slice.label}`;
    rebuildGrid();
    highlight(step);
  }
}

function triggerClick(time, stepIndex, velocity) {
  if (mix === 'kit') return;
  const note = stepIndex === 0 ? 'C7' : 'G6';
  click.triggerAttackRelease(note, '32n', time, velocity);
}

function triggerStep(time, stepIndex) {
  const tracks = currentTracks();
  const spb = stepsPerBar();
  const isBeat = stepIndex % (spb / 4) === 0;
  const vel = stepIndex === 0 ? 1 : isBeat ? 0.55 : 0.22;

  if (mix !== 'kit') triggerClick(time, stepIndex, vel);
  if (mix !== 'click') {
    if (tracks.kick?.[stepIndex]) kick.triggerAttackRelease('C1', '16n', time);
    if (tracks.snare?.[stepIndex]) {
      snareNoise.triggerAttackRelease('16n', time);
      snareBody.triggerAttackRelease('G2', '32n', time);
    }
    if (tracks.hat?.[stepIndex]) hat.triggerAttackRelease('32n', time, undefined, 0.32);
  }

  Tone.getDraw().schedule(() => highlight(stepIndex), time);
}

function maybeRamp() {
  if (!rampEnabled.checked || !playing) return;
  const every = Math.max(1, Number(rampBars.value) || 2);
  const delta = Math.max(1, Number(rampStep.value) || 5);
  const target = Number(rampTarget.value) || 120;
  barsSinceRamp += 1;
  if (barsSinceRamp < every) return;
  barsSinceRamp = 0;
  const next = Math.min(target, Tone.getTransport().bpm.value + delta);
  setBpm(next);
  setStatus(next >= target ? `Playing · ramp hit ${Math.round(target)}` : `Playing · ${Math.round(next)} BPM`);
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
      if (pattern?.wheel) {
        Tone.getDraw().schedule(() => updateWheelMeta(), time);
      }
      maybeRamp();
    }
  }, subdivision);
}

function renderChips() {
  chipsEl.innerHTML = '';
  for (const item of index) {
    const data = catalog[item.id];
    if (!data) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.id = item.id;
    btn.setAttribute('role', 'option');
    btn.innerHTML = `${data.name}<small>${data.subtitle ?? ''}</small>`;
    btn.addEventListener('click', async () => {
      const wasPlaying = playing;
      if (wasPlaying) stop();
      loadPatternById(item.id);
      if (wasPlaying) await start({ skipCountIn: true });
    });
    chipsEl.appendChild(btn);
  }
}

function syncChipSelection() {
  chipsEl.querySelectorAll('.chip').forEach((el) => {
    el.setAttribute('aria-selected', el.dataset.id === currentId ? 'true' : 'false');
  });
}

function loadPatternById(id) {
  const next = catalog[id];
  if (!next) throw new Error(`Unknown pattern: ${id}`);
  pattern = next;
  currentId = id;
  patternName.textContent = pattern.name;
  patternSub.textContent = pattern.subtitle || pattern.description || '';
  setBpm(pattern.bpmDefault ?? 90);
  Tone.getTransport().swing = Number(pattern.swing ?? 0);
  barIndex = 0;
  step = 0;
  barsSinceRamp = 0;
  rebuildPads();
  rebuildGrid();
  highlight(0);
  syncChipSelection();
}

async function countIn() {
  countingIn = true;
  setStatus('Count-in');
  const beats = 4;
  await new Promise((resolve) => {
    let i = 0;
    const counter = new Tone.Loop((time) => {
      triggerClick(time, i === 0 ? 0 : 1, i === 0 ? 1 : 0.55);
      const beat = i;
      Tone.getDraw().schedule(() => {
        highlight(Math.floor((beat / 4) * stepsPerBar()));
        setStatus(`Count-in ${beat + 1}`);
      }, time);
      i += 1;
      if (i >= beats) {
        counter.stop(time);
        Tone.getDraw().schedule(() => {
          counter.dispose();
          resolve();
        }, time);
      }
    }, '4n');
    counter.start(0);
    Tone.getTransport().start();
  });
  countingIn = false;
}

async function start({ skipCountIn = false } = {}) {
  if (!pattern) loadPatternById(currentId);
  await Tone.start();
  applyMix();
  if (rampEnabled.checked) setBpm(Number(rampStart.value) || pattern.bpmDefault || 90);
  else setBpm(Number(bpmInput.value));
  step = 0;
  barIndex = 0;
  barsSinceRamp = 0;
  playing = true;
  playBtn.textContent = 'Stop';
  playBtn.setAttribute('aria-pressed', 'true');
  stageEl.classList.add('is-playing');

  Tone.getTransport().stop();
  Tone.getTransport().position = 0;
  if (countInEl.checked && !skipCountIn) {
    await countIn();
    if (!playing) return;
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
  }

  ensureLoop();
  loop.start(0);
  Tone.getTransport().start();
  setStatus('Playing · space to stop');
}

function stop() {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  if (loop) loop.stop();
  playing = false;
  countingIn = false;
  playBtn.textContent = 'Play';
  playBtn.setAttribute('aria-pressed', 'false');
  stageEl.classList.remove('is-playing');
  setStatus('Ready · space to play');
  highlight(-1);
  [...beatPads.children].forEach((el) => el.classList.remove('on', 'downbeat'));
}

playBtn.addEventListener('click', async () => {
  if (playing || countingIn) stop();
  else await start();
});

bpmInput.addEventListener('input', () => setBpm(Number(bpmInput.value)));
volumeInput.addEventListener('input', () => {
  Tone.getDestination().volume.value = Number(volumeInput.value);
});

mixBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    mix = btn.dataset.mix;
    mixBtns.forEach((b) => b.setAttribute('aria-checked', b === btn ? 'true' : 'false'));
    applyMix();
  });
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
  e.preventDefault();
  playBtn.click();
});

renderChips();
loadPatternById(index[0].id);
applyMix();
setStatus('Ready · space to play');
