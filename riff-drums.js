import * as Tone from 'tone';
import { createAudio } from './glory-audio.js';

export const DRUM_PATTERNS = {
  rock: {
    name: 'Rock 8ths',
    steps: 8,
    kick: [1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1],
  },
  quarters: {
    name: 'Quarters',
    steps: 4,
    kick: [1, 0, 1, 0],
    snare: [0, 1, 0, 1],
    hat: [1, 0, 1, 0],
  },
  sixteenths: {
    name: '16th hats',
    steps: 16,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  click: {
    name: 'Click',
    steps: 4,
    kick: [0, 0, 0, 0],
    snare: [0, 0, 0, 0],
    hat: [0, 0, 0, 0],
    clickOnly: true,
  },
};

export function createRiffDrums() {
  const audio = createAudio();
  let patternId = 'rock';
  let enabled = true;
  let volume = 0.9;
  audio.kitGain.gain.value = volume;
  audio.clickGain.gain.value = 0.7;

  function setVolume(next) {
    volume = next;
    audio.kitGain.gain.value = enabled ? volume : 0;
    audio.clickGain.gain.value = enabled ? 0.7 : 0;
  }

  function setEnabled(next) {
    enabled = next;
    setVolume(volume);
  }

  function setPattern(id) {
    if (DRUM_PATTERNS[id]) patternId = id;
  }

  function hit(step, when) {
    if (!enabled) return;
    const pattern = DRUM_PATTERNS[patternId];
    const index = ((step % pattern.steps) + pattern.steps) % pattern.steps;
    const beat = index % (pattern.steps / 4) === 0;
    if (pattern.clickOnly) {
      audio.click.triggerAttackRelease(index === 0 ? 'C7' : 'G6', '32n', when, index === 0 ? 1 : 0.55);
      return;
    }
    if (pattern.kick[index]) audio.kick.triggerAttackRelease('C1', '16n', when);
    if (pattern.snare[index]) {
      audio.snareNoise.triggerAttackRelease('16n', when);
      audio.snareBody.triggerAttackRelease('G2', '32n', when);
    }
    if (pattern.hat[index]) audio.hat.triggerAttackRelease('32n', when, undefined, beat ? 0.4 : 0.28);
  }

  return { setVolume, setEnabled, setPattern, hit, get patternId() { return patternId; } };
}

/**
 * Schedule kit hits from the video's media clock so a loop, a seek, and a
 * slowdown all stay on the same grid. playbackRate scales wall-clock delay;
 * the grid itself is in video seconds, so 50% speed is half-tempo.
 */
export function createDrumSync(drums) {
  let video = null;
  let bpm = 80;
  let offset = 0;
  let patternSteps = 8;
  let lastHorizon = null;
  let raf = 0;

  function steps() {
    return DRUM_PATTERNS[drums.patternId]?.steps ?? patternSteps;
  }

  function stepLength() {
    return (60 / bpm) / (steps() / 4);
  }

  function arm(nextVideo) {
    video = nextVideo;
    lastHorizon = null;
  }

  function configure({ bpm: nextBpm, offset: nextOffset } = {}) {
    if (typeof nextBpm === 'number' && nextBpm > 0) bpm = nextBpm;
    if (typeof nextOffset === 'number') offset = nextOffset;
    lastHorizon = null;
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastHorizon = null;
  }

  function tick() {
    raf = 0;
    if (!video || video.paused) return;
    const rate = video.playbackRate || 1;
    const now = video.currentTime;
    const ahead = 0.07 * rate;
    const horizon = now + ahead;
    if (lastHorizon == null || horizon < lastHorizon - 0.05) {
      lastHorizon = now;
    }
    const len = stepLength();
    const first = Math.floor((lastHorizon - offset) / len) + 1;
    const last = Math.floor((horizon - offset) / len);
    const when0 = Tone.now();
    for (let step = first; step <= last; step += 1) {
      const mediaAt = offset + step * len;
      const delay = (mediaAt - now) / rate;
      if (delay < -0.03 || delay > 0.15) continue;
      drums.hit(step, when0 + Math.max(0, delay));
    }
    lastHorizon = horizon;
    raf = requestAnimationFrame(tick);
  }

  function start() {
    stop();
    lastHorizon = null;
    raf = requestAnimationFrame(tick);
  }

  return { arm, configure, start, stop };
}
