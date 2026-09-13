import * as Tone from 'tone';
import index from './patterns/index.json';
import { mountFretboard } from './fretboard.js';
import { createAudio } from './glory-audio.js';
import { readSession, writeSession } from './glory-session.js';
import { state } from './glory-state.js';
import { createEngine } from './glory-engine.js';
import { mountGeometry } from './glory-geometry.js';
import { toneSubdivision } from './glory-form.js';
import { debugLog, debugError, debugHud, mountDebug } from './glory-debug.js';

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
const riffLockEl = document.getElementById('riff-lock');
const rampEnabled = document.getElementById('ramp-enabled');
const rampStart = document.getElementById('ramp-start');
const rampTarget = document.getElementById('ramp-target');
const rampBars = document.getElementById('ramp-bars');
const rampStep = document.getElementById('ramp-step');
const stageEl = document.querySelector('.stage');
const formMeta = document.getElementById('form-meta');
const formLengthEl = document.getElementById('form-length');
const formBarLabel = document.getElementById('form-bar-label');
const barPlayhead = document.getElementById('bar-playhead');
const mixBtns = [...document.querySelectorAll('.mix-btn')];

state.currentId = index[0]?.id ?? 'chug-16th';

const audio = createAudio();
const geometry = mountGeometry(document.getElementById('geometry'));
const engine = createEngine(
  {
    beatPads, syllablesEl, stepGrid, trackRows, stepSyllable,
    formMeta, formLengthEl, formBarLabel, barPlayhead, patternSub,
    geometry,
  },
  audio,
);

Tone.getDestination().volume.value = Number(volumeInput.value);

function setBpm(bpm) {
  const n = Math.max(50, Math.min(180, Number(bpm) || 90));
  Tone.getTransport().bpm.value = n;
  bpmInput.value = String(Math.round(n));
  bpmValue.textContent = String(Math.round(n));
  persistSession();
}

function setStatus(text) {
  statusEl.textContent = text;
  debugHud(
    `play=${state.playing ? 'on' : 'off'} countIn=${state.countingIn ? 'on' : 'off'} bpm=${bpmInput?.value} mix=${state.mix} drill=${state.fretboardApi?.getState?.()?.drillMode ?? '—'} ctx=${typeof Tone !== 'undefined' ? Tone.getContext?.().state : '—'}`,
  );
}

function setMix(next) {
  state.mix = next;
  mixBtns.forEach((b) => b.setAttribute('aria-checked', b.dataset.mix === state.mix ? 'true' : 'false'));
  engine.applyMix();
  persistSession();
}

function maybeRamp() {
  if (!rampEnabled.checked || !state.playing) return;
  const every = Math.max(1, Number(rampBars.value) || 2);
  const delta = Math.max(1, Number(rampStep.value) || 5);
  const target = Number(rampTarget.value) || 120;
  state.barsSinceRamp += 1;
  if (state.barsSinceRamp < every) return;
  state.barsSinceRamp = 0;
  const next = Math.min(target, Tone.getTransport().bpm.value + delta);
  setBpm(next);
  setStatus(next >= target ? `Playing · ramp hit ${Math.round(target)}` : `Playing · ${Math.round(next)} BPM`);
}

function ensureLoop() {
  if (state.loop) {
    state.loop.dispose();
    state.loop = null;
  }
  const subdivision = toneSubdivision(state.pattern?.stepsPerBar ?? 16);
  state.loop = new Tone.Loop((time) => {
    engine.triggerStep(time, state.step);
    state.step += 1;
    if (state.step >= (state.pattern?.stepsPerBar ?? 16)) {
      state.step = 0;
      state.barIndex += 1;
      // Form UI refreshes on the new bar's first step (inside triggerStep),
      // not here — otherwise draw callbacks read the new barIndex one 16th early.
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
    const bars = data.form?.length || data.tracksByBar?.length || 1;
    const tag = bars > 1 ? `${bars}-bar` : '';
    btn.innerHTML = `${data.name}<small>${tag ? `${tag} · ` : ''}${data.subtitle ?? ''}</small>`;
    btn.addEventListener('click', async () => {
      const wasPlaying = state.playing;
      if (wasPlaying) stop();
      loadPatternById(item.id);
      if (wasPlaying) await start({ skipCountIn: true });
    });
    chipsEl.appendChild(btn);
  }
}

function syncChipSelection() {
  chipsEl.querySelectorAll('.chip').forEach((el) => {
    el.setAttribute('aria-selected', el.dataset.id === state.currentId ? 'true' : 'false');
  });
}

function loadPatternById(id, { applyDefaultBpm = true } = {}) {
  const next = catalog[id];
  if (!next) throw new Error(`Unknown pattern: ${id}`);
  state.pattern = next;
  state.currentId = id;
  patternName.textContent = state.pattern.name;
  patternSub.textContent = state.pattern.subtitle || state.pattern.description || '';
  if (applyDefaultBpm) setBpm(state.pattern.bpmDefault ?? 90);
  Tone.getTransport().swing = Number(state.pattern.swing ?? 0);
  state.barIndex = 0;
  state.step = 0;
  state.barsSinceRamp = 0;
  engine.rebuildPads();
  engine.rebuildBarPlayhead();
  engine.rebuildGrid();
  engine.highlight(0);
  syncChipSelection();
  persistSession();
}

let playToken = 0;
let countInFinish = null;

function finishCountIn() {
  if (!countInFinish) return;
  const done = countInFinish;
  countInFinish = null;
  done();
}

async function countIn(token) {
  state.countingIn = true;
  setStatus('Count-in');
  debugLog('count-in');
  const beats = 4;
  await new Promise((resolve) => {
    countInFinish = resolve;
    let i = 0;
    const counter = new Tone.Loop((time) => {
      if (token !== playToken) {
        counter.stop(time);
        counter.dispose();
        finishCountIn();
        return;
      }
      engine.triggerClick(time, i === 0 ? 0 : 1, i === 0 ? 1 : 0.55, { force: true });
      const beat = i;
      Tone.getDraw().schedule(() => {
        engine.highlight(Math.floor((beat / 4) * (state.pattern?.stepsPerBar ?? 16)));
        setStatus(`Count-in ${beat + 1}`);
      }, time);
      i += 1;
      if (i >= beats) {
        counter.stop(time);
        Tone.getDraw().schedule(() => {
          counter.dispose();
          finishCountIn();
        }, time);
      }
    }, '4n');
    counter.start(0);
    Tone.getTransport().start();
    setTimeout(() => finishCountIn(), 8000);
  });
  state.countingIn = false;
}

async function start({ skipCountIn = false } = {}) {
  const token = ++playToken;
  try {
    if (!state.pattern) loadPatternById(state.currentId);
    await Tone.start();
    if (Tone.getContext().state !== 'running') await Tone.getContext().resume();
    if (token !== playToken) return;
    engine.applyMix();
    if (rampEnabled.checked) setBpm(Number(rampStart.value) || state.pattern.bpmDefault || 90);
    else setBpm(Number(bpmInput.value));
    state.step = 0;
    state.barIndex = 0;
    state.barsSinceRamp = 0;
    engine.refreshFormUi();
    state.playing = true;
    playBtn.textContent = 'Stop';
    playBtn.setAttribute('aria-pressed', 'true');
    stageEl.classList.add('is-playing');

    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    if (countInEl.checked && !skipCountIn) {
      await countIn(token);
      if (token !== playToken || !state.playing) return;
      Tone.getTransport().stop();
      Tone.getTransport().position = 0;
    }

    ensureLoop();
    state.loop.start(0);
    Tone.getTransport().start();
    setStatus('Playing · space to stop');
    debugLog('start ok', { bpm: bpmInput.value, pattern: state.currentId, skipCountIn });
  } catch (err) {
    debugError('start', err);
    stop();
    setStatus(`Couldn’t start — click Play again (${err.message || err})`);
  }
}

function stop() {
  debugLog('stop');
  playToken += 1;
  finishCountIn();
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  if (state.loop) {
    state.loop.stop();
    state.loop.dispose();
    state.loop = null;
  }
  state.playing = false;
  state.countingIn = false;
  playBtn.textContent = 'Play';
  playBtn.setAttribute('aria-pressed', 'false');
  stageEl.classList.remove('is-playing');
  setStatus('Ready · space to play');
  engine.highlight(-1);
  [...beatPads.children].forEach((el) => el.classList.remove('on', 'downbeat'));
}

function persistSession() {
  if (state.suppressPersist) return;
  const fret = state.fretboardApi?.getState?.() ?? {};
  try {
  writeSession({
    patternId: state.currentId,
    bpm: Number(bpmInput.value),
    mix: state.mix,
    volume: Number(volumeInput.value),
    countIn: Boolean(countInEl.checked),
    riffLock: Boolean(riffLockEl.checked),
    ramp: {
      enabled: Boolean(rampEnabled.checked),
      start: Number(rampStart.value),
      target: Number(rampTarget.value),
      bars: Number(rampBars.value),
      step: Number(rampStep.value),
    },
    fretboard: {
      scaleId: fret.scaleId,
      rootPc: fret.rootPc,
      patternId: fret.patternId,
      drillMode: fret.drillMode,
    },
  });
  } catch (err) {
    console.warn('session persist', err);
  }
}

function restoreSession(session) {
  if (!session) return;
  state.suppressPersist = true;
  try {
    if (session.mix && ['click', 'kit', 'both'].includes(session.mix)) {
      state.mix = session.mix;
      mixBtns.forEach((b) => b.setAttribute('aria-checked', b.dataset.mix === state.mix ? 'true' : 'false'));
    }
    if (typeof session.volume === 'number') {
      volumeInput.value = String(session.volume);
      Tone.getDestination().volume.value = session.volume;
    }
    if (typeof session.countIn === 'boolean') countInEl.checked = session.countIn;
    if (typeof session.riffLock === 'boolean') {
      state.riffLock = session.riffLock;
      riffLockEl.checked = session.riffLock;
    }
    if (session.ramp) {
      rampEnabled.checked = Boolean(session.ramp.enabled);
      if (session.ramp.start != null) rampStart.value = String(session.ramp.start);
      if (session.ramp.target != null) rampTarget.value = String(session.ramp.target);
      if (session.ramp.bars != null) rampBars.value = String(session.ramp.bars);
      if (session.ramp.step != null) rampStep.value = String(session.ramp.step);
    }
    const id = catalog[session.patternId] ? session.patternId : index[0].id;
    loadPatternById(id, { applyDefaultBpm: false });
    if (typeof session.bpm === 'number') setBpm(session.bpm);
    engine.applyMix();
    if (session.fretboard && state.fretboardApi?.setState) {
      state.fretboardApi.setState(session.fretboard);
    }
  } finally {
    state.suppressPersist = false;
  }
}

playBtn.addEventListener('click', async () => {
  if (state.playing || state.countingIn) stop();
  else await start();
});

bpmInput.addEventListener('input', () => setBpm(Number(bpmInput.value)));
volumeInput.addEventListener('input', () => {
  Tone.getDestination().volume.value = Number(volumeInput.value);
  persistSession();
});

countInEl.addEventListener('change', () => persistSession());
rampEnabled.addEventListener('change', () => persistSession());
rampStart.addEventListener('change', () => persistSession());
rampTarget.addEventListener('change', () => persistSession());
rampBars.addEventListener('change', () => persistSession());
rampStep.addEventListener('change', () => persistSession());

riffLockEl.addEventListener('change', () => {
  state.riffLock = riffLockEl.checked;
  engine.applyRiffGain();
  persistSession();
});

mixBtns.forEach((btn) => {
  btn.addEventListener('click', () => setMix(btn.dataset.mix));
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  playBtn.click();
});

const saved = readSession();
mountDebug();
debugLog('boot');
renderChips();
state.fretboardApi = mountFretboard({
  onChange: () => {
    debugLog('fretboard', state.fretboardApi?.getState?.());
    persistSession();
  },
  initial: saved?.fretboard,
});
if (saved) restoreSession(saved);
else {
  loadPatternById(index[0].id);
  engine.applyMix();
}
setStatus('Ready · space to play');

