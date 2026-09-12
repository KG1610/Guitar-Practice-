import * as Tone from 'tone';
import { state } from './glory-state.js';
import {
  stepsPerBar, syllablesFor, formBars, formLength, isMultiBar, currentBar, currentTracks,
} from './glory-form.js';

export function createEngine(ui, audio) {
  const {
    beatPads, syllablesEl, stepGrid, trackRows, stepSyllable,
    formMeta, formLengthEl, formBarLabel, barPlayhead, patternSub,
  } = ui;
  const {
    kick, snareNoise, snareBody, hat, click, riffSynth,
    kitGain, clickGain, riffGain,
  } = audio;

  function applyRiffGain() {
    const kitAllowed = state.mix === 'kit' || state.mix === 'both';
    riffGain.gain.rampTo(state.riffLock && kitAllowed ? 0.55 : 0, 0.05);
  }

  function applyMix() {
    kitGain.gain.rampTo(state.mix !== 'click' ? 1 : 0, 0.04);
    clickGain.gain.rampTo(state.mix !== 'kit' ? 0.9 : 0, 0.04);
    applyRiffGain();
  }

  function rebuildPads() {
    beatPads.innerHTML = '';
    for (let i = 0; i < 4; i += 1) beatPads.appendChild(document.createElement('span'));
  }

  function updateFormMeta() {
    if (!isMultiBar()) return;
    const bar = currentBar();
    const idx = state.barIndex % formLength();
    formBarLabel.textContent = bar?.label
      ? `${bar.label} · ${idx + 1}/${formLength()}`
      : `Bar ${idx + 1}/${formLength()}`;
    [...barPlayhead.children].forEach((el, i) => el.classList.toggle('on', i === idx));
  }

  function rebuildBarPlayhead() {
    const n = formLength();
    const multi = isMultiBar();
    formMeta.hidden = !multi;
    barPlayhead.hidden = !multi;
    if (!multi) {
      barPlayhead.innerHTML = '';
      return;
    }
    formLengthEl.textContent = `${n}-bar form`;
    const bars = formBars();
    barPlayhead.innerHTML = '';
    for (let i = 0; i < n; i += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'bar-cell';
      cell.dataset.bar = String(i);
      cell.textContent = String(i + 1);
      cell.title = bars[i]?.label ?? `Bar ${i + 1}`;
      cell.setAttribute('aria-label', `Bar ${i + 1}: ${bars[i]?.label ?? ''}`);
      barPlayhead.appendChild(cell);
    }
    updateFormMeta();
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
    const names = [['kick', 'Kick'], ['snare', 'Snare'], ['hat', 'Hat'], ['click', 'Click']];
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

  function refreshFormUi() {
    updateFormMeta();
    if (isMultiBar()) {
      const bar = currentBar();
      if (bar?.label) {
        const base = state.pattern.subtitle ?? state.pattern.description ?? '';
        patternSub.textContent = base ? `${base} · ${bar.label}` : bar.label;
      }
      rebuildGrid();
      highlight(state.step);
    }
  }

  function triggerClick(time, stepIndex, velocity) {
    if (state.mix === 'kit') return;
    click.triggerAttackRelease(stepIndex === 0 ? 'C7' : 'G6', '32n', time, velocity);
  }

  function triggerRiff(time) {
    if (!state.riffLock || state.mix === 'click') return;
    riffSynth.triggerAttackRelease('E1', '32n', time, 0.7);
  }

  function emitDrumEvent(kind, stepIndex, time) {
    const detail = { kind, step: stepIndex, bar: state.barIndex, time };
    window.dispatchEvent(new CustomEvent('practice-desk-drum', { detail }));
    if (state.fretboardApi?.onDrumEvent) state.fretboardApi.onDrumEvent(detail);
  }

  function triggerStep(time, stepIndex) {
    const tracks = currentTracks();
    const spb = stepsPerBar();
    const isBeat = stepIndex % (spb / 4) === 0;
    const vel = stepIndex === 0 ? 1 : isBeat ? 0.55 : 0.22;

    if (state.mix !== 'kit') triggerClick(time, stepIndex, vel);
    if (state.mix !== 'click') {
      if (tracks.kick?.[stepIndex]) {
        kick.triggerAttackRelease('C1', '16n', time);
        triggerRiff(time);
        Tone.getDraw().schedule(() => emitDrumEvent('kick', stepIndex, time), time);
      }
      if (tracks.snare?.[stepIndex]) {
        snareNoise.triggerAttackRelease('16n', time);
        snareBody.triggerAttackRelease('G2', '32n', time);
        Tone.getDraw().schedule(() => emitDrumEvent('snare', stepIndex, time), time);
      }
      if (tracks.hat?.[stepIndex]) hat.triggerAttackRelease('32n', time, undefined, 0.32);
    }

    if (isBeat) Tone.getDraw().schedule(() => emitDrumEvent('beat', stepIndex, time), time);
    if (state.mix !== 'kit') Tone.getDraw().schedule(() => emitDrumEvent('click', stepIndex, time), time);
    else if (isBeat) Tone.getDraw().schedule(() => emitDrumEvent('click', stepIndex, time), time);

    Tone.getDraw().schedule(() => highlight(stepIndex), time);
  }

  return {
    applyMix,
    applyRiffGain,
    rebuildPads,
    rebuildBarPlayhead,
    rebuildGrid,
    highlight,
    refreshFormUi,
    triggerClick,
    triggerStep,
    updateFormMeta,
  };
}
