/**
 * Session planner and the running session bar. Each block sets up the right
 * view (warm-up drill on the Desk, the riff, its theory, a jam in the riff's
 * scale) and counts down. Time up plays a soft chime and lights "Next"; it
 * never switches views on its own while you are playing.
 */
import * as Tone from 'tone';
import { deskApi, riffApi } from '../bridge.js';
import { parseKey, pcName } from '../theory/scales.js';
import {
  BLOCKS, addMinute, cleanPlan, formatClock, isPaused, nextBlock, pauseSession, planMinutes,
  resumeSession, startSession, timeLeft, warmupFor,
} from './plan.js';

const PLAN_KEY = 'practice-desk-session-plan-v1';
const LOG_KEY = 'practice-desk-sessions-v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/** What to do in each block, in a sentence. */
function instructions(id, warmup) {
  const riff = riffApi.current();
  const key = parseKey(riff?.key);
  switch (id) {
    case 'warmup': {
      const where = warmup.useRiffKey && key ? ` (${pcName(key.rootPc)} ${key.mode === 'minor' ? 'minor' : 'major'} pentatonic)` : '';
      return `${warmup.name}${where}: ${warmup.text}`;
    }
    case 'riff':
      return riff
        ? `${riff.title}: loop the bar that trips you up, speed builder on. Count-in, play, back off when you miss.`
        : 'Pick a riff in the Riff Room, loop the hardest bar, and turn the speed builder on.';
    case 'theory':
      return 'Read what the lick is made of, then play one "Make it yours" card until it feels like yours.';
    case 'jam':
      return riff
        ? 'Improvise over the loop in the riff\'s scale. Steal one idea from the riff and land your phrases on the root.'
        : 'Improvise over the loop. Land your phrases on the root (teal on the fretboard).';
    default:
      return '';
  }
}

export function mountSession(root, toggle) {
  let plan = cleanPlan(readJson(PLAN_KEY, null));
  let session = null;
  let warmup = warmupFor();
  let timer = 0;
  let chimed = false;
  let synth = null;

  root.innerHTML = `
    <section class="session-panel" id="session-panel" hidden aria-label="Practice session">
      <div class="grid-head">
        <span class="grid-title">Practice session</span>
        <span id="session-total"></span>
      </div>
      <ol class="session-blocks" id="session-blocks"></ol>
      <div class="session-actions">
        <button type="button" id="session-start" class="primary">Start session</button>
        <span id="session-last" class="riff-note"></span>
      </div>
    </section>
    <div class="session-bar" id="session-bar" hidden role="status" aria-live="polite">
      <div class="session-bar-main">
        <span class="session-step" id="session-step"></span>
        <output class="session-clock" id="session-clock">0:00</output>
        <span class="session-next" id="session-next"></span>
      </div>
      <p class="session-what" id="session-what"></p>
      <div class="session-controls">
        <button type="button" id="session-pause">Pause</button>
        <button type="button" id="session-more">+1 min</button>
        <button type="button" id="session-skip" class="primary">Next</button>
        <button type="button" id="session-end">End</button>
      </div>
    </div>`;
  // The bar is pinned to the screen, so it lives on <body>: inside the Desk
  // container it would sit under the Riff Room's stacking layer.
  const barEl = root.querySelector('#session-bar');
  document.body.appendChild(barEl);
  const q = (sel) => root.querySelector(sel) ?? (barEl.matches(sel) ? barEl : barEl.querySelector(sel));

  toggle.addEventListener('click', () => {
    const panel = q('#session-panel');
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    if (!panel.hidden) paintPlanner();
  });
  q('#session-start').addEventListener('click', start);
  q('#session-pause').addEventListener('click', () => {
    const now = Date.now();
    session = isPaused(session) ? resumeSession(session, now) : pauseSession(session, now);
    paintBar();
  });
  q('#session-more').addEventListener('click', () => {
    session = addMinute(session, Date.now());
    chimed = false;
    paintBar();
  });
  q('#session-skip').addEventListener('click', next);
  q('#session-end').addEventListener('click', () => finish(true));
  window.addEventListener('keydown', (event) => {
    if (!session || session.done || event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    next();
  });

  function savePlan() {
    writeJson(PLAN_KEY, plan);
  }

  function paintPlanner() {
    warmup = warmupFor();
    q('#session-blocks').innerHTML = plan.map((b) => `
      <li class="session-block${b.on ? '' : ' off'}">
        <label class="check"><input type="checkbox" data-on="${b.id}" ${b.on ? 'checked' : ''} /><span>${BLOCKS[b.id].name}</span></label>
        <label class="riff-inline"><input type="number" min="1" max="60" data-minutes="${b.id}" value="${b.minutes}" /> min</label>
        <p class="session-block-what">${esc(instructions(b.id, warmup))}</p>
      </li>`).join('');
    root.querySelectorAll('[data-on]').forEach((el) => {
      el.addEventListener('change', () => {
        plan = cleanPlan(plan.map((b) => (b.id === el.dataset.on ? { ...b, on: el.checked } : b)));
        savePlan();
        paintPlanner();
      });
    });
    root.querySelectorAll('[data-minutes]').forEach((el) => {
      el.addEventListener('change', () => {
        plan = cleanPlan(plan.map((b) => (b.id === el.dataset.minutes ? { ...b, minutes: Number(el.value) } : b)));
        savePlan();
        paintPlanner();
      });
    });
    q('#session-total').textContent = `${planMinutes(plan)} min`;
    q('#session-start').disabled = planMinutes(plan) === 0;
    const log = readJson(LOG_KEY, []);
    q('#session-last').textContent = log.length
      ? `Last: ${new Date(log[0].at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${log[0].minutes} min${log[0].riff ? ` on ${log[0].riff}` : ''}. ${log.length} session${log.length === 1 ? '' : 's'} logged.`
      : '';
  }

  /** Set up the screen for the block that just started. */
  function enter(id) {
    chimed = false;
    if (id === 'warmup') {
      riffApi.pause();
      riffApi.showView('desk');
      const riff = riffApi.current();
      const key = parseKey(riff?.key);
      if (warmup.useRiffKey && key) {
        deskApi.showFretboard({
          rootPc: key.rootPc,
          scaleId: key.mode === 'minor' ? 'minor-pentatonic' : 'major-pentatonic',
          patternId: 'box-1',
        });
      }
      deskApi.loadPattern({ patternId: warmup.patternId, bpm: warmup.bpm, label: `Warm-up: ${warmup.name}` });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'riff') {
      deskApi.stop();
      riffApi.showView('riff');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (id === 'theory') {
      deskApi.stop();
      riffApi.showView('riff');
      document.getElementById('riff-theory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (id === 'jam') {
      if (!riffApi.jam()) {
        riffApi.showView('desk');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  function start() {
    session = startSession(plan, Date.now());
    if (!session) return;
    warmup = warmupFor();
    q('#session-panel').hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    q('#session-bar').hidden = false;
    document.body.classList.add('in-session');
    enter(session.blocks[0].id);
    window.clearInterval(timer);
    timer = window.setInterval(tick, 250);
    paintBar();
  }

  function next() {
    if (!session) return;
    session = nextBlock(session, Date.now());
    if (session.done) {
      finish(false);
      return;
    }
    enter(session.blocks[session.index].id);
    paintBar();
  }

  function finish(early) {
    if (!session) return;
    const ended = session.done ? session : nextBlock({ ...session, index: session.blocks.length - 1 }, Date.now());
    const minutes = Math.round(ended.practisedMs / 60000);
    if (minutes >= 1) {
      const riff = riffApi.current();
      const log = readJson(LOG_KEY, []);
      log.unshift({ at: new Date().toISOString(), minutes, riff: riff?.title || '', blocks: ended.blocks.map((b) => b.id) });
      writeJson(LOG_KEY, log.slice(0, 60));
    }
    window.clearInterval(timer);
    session = null;
    q('#session-bar').hidden = true;
    document.body.classList.remove('in-session');
    const status = document.getElementById('status');
    if (status && !early) status.textContent = `Session done: ${minutes} min. Nice work.`;
    chime([76, 81, 88]);
  }

  async function chime(notes = [76, 81]) {
    try {
      await Tone.start();
      if (!synth) {
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.6 },
        }).toDestination();
        synth.volume.value = -14;
      }
      const now = Tone.now() + 0.02;
      notes.forEach((midi, i) => synth.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), 0.4, now + i * 0.18));
    } catch { /* audio not started yet */ }
  }

  function tick() {
    if (!session) return;
    const left = timeLeft(session, Date.now());
    if (left === 0 && !chimed && !isPaused(session)) {
      chimed = true;
      chime();
    }
    paintBar();
  }

  function paintBar() {
    if (!session || session.done) return;
    const now = Date.now();
    const block = session.blocks[session.index];
    const upcoming = session.blocks[session.index + 1];
    const left = timeLeft(session, now);
    q('#session-step').textContent = `${session.index + 1}/${session.blocks.length} · ${BLOCKS[block.id].name}`;
    q('#session-clock').textContent = isPaused(session) ? `${formatClock(left)} paused` : formatClock(left);
    q('#session-next').textContent = upcoming ? `Next: ${BLOCKS[upcoming.id].name} (${upcoming.minutes} min)` : 'Last block';
    q('#session-what').textContent = instructions(block.id, warmup);
    q('#session-pause').textContent = isPaused(session) ? 'Resume' : 'Pause';
    q('#session-skip').textContent = upcoming ? 'Next (N)' : 'Finish';
    q('#session-bar').classList.toggle('time-up', left === 0);
  }

  return {
    get running() { return Boolean(session); },
  };
}
