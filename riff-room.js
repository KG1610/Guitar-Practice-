import * as Tone from 'tone';
import { deskApi } from './glory-bridge.js';
import { DRUM_PATTERNS, createDrumSync, createRiffDrums } from './riff-drums.js';
import { beatsFromMedia, mountPlayableTab } from './riff-tab.js';
import { keyToFretboard } from './riff-keys.js';

const KEYS = [
  'A minor', 'C major', 'E minor', 'G major', 'D minor', 'F major',
  'B minor', 'D major', 'F# minor', 'A major', 'C# minor', 'E major',
];

export function mountRiffRoom(root) {
  root.innerHTML = template();
  const q = (sel) => root.querySelector(sel);
  const drums = createRiffDrums();
  const sync = createDrumSync(drums);
  const video = q('#riff-video');
  video.preservesPitch = true;
  video.webkitPreservesPitch = true;
  sync.arm(video);

  const tabHost = q('#riff-alphatab');
  const tabScroll = q('#riff-tab-scroll');
  const tab = mountPlayableTab(tabHost, tabScroll);

  const state = {
    riff: null,
    library: [],
    query: '',
    sort: 'added-desc',
    loop: true,
    loopA: null,
    loopB: null,
    taps: [],
    speed: 1,
    speedTimer: 0,
  };

  function setView(next) {
    document.body.dataset.view = next;
    document.querySelectorAll('.view-tab').forEach((btn) => {
      btn.setAttribute('aria-selected', btn.dataset.view === next ? 'true' : 'false');
    });
    try { sessionStorage.setItem('practice-desk-view', next); } catch { /* private mode */ }
    if (next !== 'riff') {
      video.pause();
      sync.stop();
    }
  }

  document.querySelectorAll('.view-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === 'desk') deskApi.stop();
      setView(btn.dataset.view);
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space') return;
    if (document.body.dataset.view !== 'riff') return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    event.preventDefault();
    event.stopPropagation();
    togglePlay();
  }, true);

  q('#riff-import').addEventListener('click', () => importUrl());
  q('#riff-url').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') importUrl();
  });
  q('#riff-file').addEventListener('change', () => {
    const file = q('#riff-file').files?.[0];
    if (file) uploadFile(file);
  });
  q('#riff-play').addEventListener('click', togglePlay);
  q('#riff-loop').addEventListener('click', () => {
    state.loop = !state.loop;
    q('#riff-loop').setAttribute('aria-pressed', state.loop ? 'true' : 'false');
    applyLoopMode();
    savePatch({ loopClip: state.loop });
  });
  q('#riff-set-a').addEventListener('click', () => {
    state.loopA = video.currentTime || 0;
    paintLoop();
  });
  q('#riff-set-b').addEventListener('click', () => {
    state.loopB = video.currentTime || 0;
    paintLoop();
  });
  q('#riff-clear-ab').addEventListener('click', () => {
    state.loopA = null;
    state.loopB = null;
    paintLoop();
  });
  q('#riff-speed').addEventListener('input', () => {
    state.speed = Number(q('#riff-speed').value) / 100;
    video.playbackRate = state.speed;
    paintSpeed();
    window.clearTimeout(state.speedTimer);
    state.speedTimer = window.setTimeout(() => savePatch({ speed: state.speed }), 400);
  });
  q('#riff-sync').addEventListener('click', () => syncQueue());
  q('#riff-search').addEventListener('input', () => {
    state.query = q('#riff-search').value;
    renderPicker();
  });
  q('#riff-sort').addEventListener('change', () => {
    state.sort = q('#riff-sort').value;
    renderPicker();
  });
  q('#riff-rename').addEventListener('click', () => renameRiff(state.riff));
  q('#riff-video-vol').addEventListener('input', () => {
    video.volume = Number(q('#riff-video-vol').value) / 100;
  });
  q('#riff-drum-vol').addEventListener('input', () => {
    drums.setVolume(Number(q('#riff-drum-vol').value) / 100);
  });
  q('#riff-drums-on').addEventListener('change', () => {
    drums.setEnabled(q('#riff-drums-on').checked);
  });
  q('#riff-bpm').addEventListener('change', () => commitBpm(Number(q('#riff-bpm').value)));
  q('#riff-half').addEventListener('click', () => commitBpm((state.riff?.bpm || 80) / 2));
  q('#riff-double').addEventListener('click', () => commitBpm((state.riff?.bpm || 80) * 2));
  q('#riff-tap').addEventListener('click', tapTempo);
  q('#riff-key').addEventListener('change', () => savePatch({ key: q('#riff-key').value }));
  q('#riff-offset').addEventListener('change', () => {
    const offset = Number(q('#riff-offset').value);
    savePatch({ downbeatOffset: offset });
  });
  q('#riff-notes').addEventListener('change', () => savePatch({ notes: q('#riff-notes').value }));
  q('#riff-apply-tex').addEventListener('click', () => {
    const alphatex = q('#riff-tex').value;
    tab.load(alphatex);
    savePatch({ alphatex });
  });
  q('#riff-neck').addEventListener('click', () => {
    const next = keyToFretboard(state.riff?.key || q('#riff-key').value);
    if (next) deskApi.showFretboard(next);
    setView('desk');
  });

  root.querySelectorAll('[data-drum]').forEach((btn) => {
    btn.addEventListener('click', () => {
      drums.setPattern(btn.dataset.drum);
      root.querySelectorAll('[data-drum]').forEach((other) => {
        other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
      });
      sync.configure({ bpm: state.riff?.bpm || 80, offset: state.riff?.downbeatOffset || 0 });
    });
  });

  video.addEventListener('play', async () => {
    await Tone.start();
    deskApi.stop();
    sync.configure({
      bpm: Number(state.riff?.bpm) || 80,
      offset: Number(state.riff?.downbeatOffset) || 0,
    });
    sync.start();
    q('#riff-play').textContent = 'Pause';
  });
  video.addEventListener('pause', () => {
    sync.stop();
    q('#riff-play').textContent = 'Play';
  });
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('seeked', () => { sync.configure({}); });

  function onTime() {
    const riff = state.riff;
    if (!riff) return;
    if (state.loopA != null && state.loopB != null && state.loopB > state.loopA) {
      if (video.currentTime >= state.loopB - 0.04) {
        video.currentTime = state.loopA;
      }
    }
    const beats = beatsFromMedia(video.currentTime, Number(riff.bpm) || 80, Number(riff.downbeatOffset) || 0);
    tab.follow(beats);
    const bar = Math.floor(beats / 4);
    q('#riff-where').textContent = beats < 0
      ? 'Before the first bar'
      : `Bar ${bar + 1} · beat ${(beats % 4 + 1).toFixed(1)}`;
  }

  function applyLoopMode() {
    const ab = state.loopA != null && state.loopB != null && state.loopB > state.loopA;
    video.loop = state.loop && !ab;
  }

  function paintLoop() {
    const a = state.loopA;
    const b = state.loopB;
    q('#riff-ab-readout').textContent = a == null && b == null
      ? 'Whole clip'
      : `A ${fmt(a)} – B ${fmt(b)}`;
    applyLoopMode();
    if (state.riff) savePatch({ loopA: a, loopB: b });
  }

  function paintSpeed() {
    const pct = Math.round(state.speed * 100);
    const bpm = Number(state.riff?.bpm) || 80;
    q('#riff-speed-readout').textContent = `${pct}% · kit ${Math.round(bpm * state.speed)} BPM`;
  }

  async function togglePlay() {
    if (!state.riff) return;
    if (video.paused) {
      try { await video.play(); } catch (err) { setStatus(err.message || 'Could not play'); }
    } else {
      video.pause();
    }
  }

  async function importUrl() {
    const url = q('#riff-url').value.trim();
    if (!url) return;
    setStatus('Sending the link to the local helper…');
    const res = await fetch('/api/riffs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const body = await res.json();
    if (!res.ok) {
      setStatus(body.error || 'Import failed');
      return;
    }
    poll(body.jobId);
  }

  async function uploadFile(file) {
    const data = new FormData();
    data.append('file', file);
    data.append('title', file.name.replace(/\.[^.]+$/, ''));
    setStatus('Reading the file locally…');
    const res = await fetch('/api/riffs/upload', { method: 'POST', body: data });
    const body = await res.json();
    if (!res.ok) {
      setStatus(body.error || 'Upload failed');
      return;
    }
    poll(body.jobId);
  }

  async function poll(jobId, { quiet = false } = {}) {
    const timer = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      const job = await res.json();
      if (job.status === 'done') {
        clearInterval(timer);
        await refreshList(job.riff?.id);
        if (job.riff && !quiet) openRiff(job.riff);
        else if (job.riff && !state.riff) openRiffById(job.riff.id);
        else if (!state.riff && state.library[0]) openRiffById(state.library[0].id);
        setStatus(job.skipped ? 'Already in the library' : (job.step || 'Ready — space to play'));
      } else if (job.status === 'error') {
        clearInterval(timer);
        setStatus(job.error || 'Import failed');
      } else {
        const progress = job.total ? ` (${job.done || 0}/${job.total})` : '';
        setStatus(`${job.step || 'Working…'}${progress}`);
      }
    }, 600);
  }

  async function refreshList(selectId) {
    try {
      const res = await fetch('/api/riffs');
      if (!res.ok) throw new Error('helper');
      state.library = (await res.json()).riffs || [];
      q('#riff-helper').hidden = true;
    } catch {
      q('#riff-helper').hidden = false;
      state.library = [];
    }
    renderPicker(selectId || state.riff?.id);
  }

  function visibleSongs() {
    const query = state.query.trim().toLowerCase();
    const filtered = state.library.filter((riff) => {
      if (!query) return true;
      const hay = [riff.title, riff.uploader, riff.key, riff.notes, riff.bpm].join(' ').toLowerCase();
      return hay.includes(query);
    });
    const copy = [...filtered];
    if (state.sort === 'title') copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (state.sort === 'bpm') copy.sort((a, b) => (Number(a.bpm) || 0) - (Number(b.bpm) || 0));
    else if (state.sort === 'added-asc') copy.sort((a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')));
    else copy.sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
    return copy;
  }

  function renderPicker(selectId) {
    const list = q('#riff-list');
    const songs = visibleSongs();
    const current = selectId || state.riff?.id;
    q('#riff-count').textContent = state.library.length
      ? `${state.library.length} saved`
      : 'Nothing saved yet';
    list.innerHTML = '';
    if (!songs.length) {
      list.innerHTML = `<p class="riff-empty">${state.library.length ? 'No songs match that search.' : 'Paste a link, or Sync to pull the queue.'}</p>`;
      return;
    }
    for (const riff of songs) {
      const card = document.createElement('article');
      card.className = 'song-card';
      if (riff.id === current) card.setAttribute('aria-current', 'true');
      const thumb = riff.poster
        ? `<img src="${escapeHtml(riff.poster)}" alt="" />`
        : `<span class="song-fallback" aria-hidden="true">${escapeHtml((riff.title || '?').slice(0, 1))}</span>`;
      card.innerHTML = `
        <button type="button" class="song-open">
          ${thumb}
          <span class="song-copy">
            <strong>${escapeHtml(riff.title || 'Untitled riff')}</strong>
            <em>${escapeHtml(riff.uploader || 'Unknown')}</em>
            <span>${escapeHtml(riff.key || 'Key —')} · ${Math.round(riff.bpm || 0)} BPM</span>
            <time>${escapeHtml(formatAdded(riff.addedAt))}</time>
          </span>
        </button>
        <span class="song-actions">
          <button type="button" data-rename>Rename</button>
          <button type="button" data-delete>Delete</button>
        </span>`;
      card.querySelector('.song-open').addEventListener('click', () => openRiffById(riff.id));
      card.querySelector('[data-rename]').addEventListener('click', (event) => {
        event.stopPropagation();
        renameRiff(riff);
      });
      card.querySelector('[data-delete]').addEventListener('click', (event) => {
        event.stopPropagation();
        deleteRiff(riff);
      });
      list.appendChild(card);
    }
  }

  async function openRiffById(id) {
    const res = await fetch(`/api/riffs/${id}`);
    if (!res.ok) {
      setStatus('That song is no longer in the library');
      await refreshList();
      return;
    }
    openRiff(await res.json());
  }

  function openRiff(riff) {
    state.riff = riff;
    state.loopA = riff.loopA ?? null;
    state.loopB = riff.loopB ?? null;
    state.loop = riff.loopClip !== false;
    state.speed = Math.min(1, Math.max(0.5, Number(riff.speed) || 1));
    q('#riff-loop').setAttribute('aria-pressed', state.loop ? 'true' : 'false');
    q('#riff-speed').value = String(Math.round(state.speed * 100));
    video.playbackRate = state.speed;
    video.preservesPitch = true;
    video.webkitPreservesPitch = true;
    if (video.getAttribute('src') !== riff.video) {
      video.src = riff.video;
      video.load();
    }
    q('#riff-title').textContent = riff.title || 'Untitled riff';
    q('#riff-by').textContent = riff.uploader ? riff.uploader : '';
    q('#riff-bpm').value = String(Math.round(riff.bpm || 80));
    q('#riff-key').value = KEYS.includes(riff.key) ? riff.key : 'A minor';
    if (!KEYS.includes(riff.key) && riff.key) {
      const opt = document.createElement('option');
      opt.value = riff.key;
      opt.textContent = riff.key;
      q('#riff-key').appendChild(opt);
      q('#riff-key').value = riff.key;
    }
    q('#riff-offset').value = String(riff.downbeatOffset ?? 0);
    q('#riff-notes').value = riff.notes || '';
    q('#riff-tex').value = riff.alphatex || '';
    q('#riff-bpm-note').textContent = riff.bpmNote || '';
    q('#riff-key-note').textContent = riff.keyNote || '';
    const report = riff.tabReport || {};
    const warnings = report.warnings || [];
    q('#riff-tab-note').textContent = warnings.length
      ? warnings.join(' ')
      : `Read ${report.noteCount || 0} frets across ${report.barCount || 0} bars.`;
    const image = q('#riff-tab-image');
    if (riff.tabImage) {
      image.src = riff.tabImage;
      image.hidden = false;
    } else {
      image.hidden = true;
    }
    const strip = q('#riff-frames');
    strip.innerHTML = '';
    for (const src of riff.frames || []) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Tab frame';
      strip.appendChild(img);
    }
    tab.load(riff.alphatex || '');
    sync.configure({ bpm: Number(riff.bpm) || 80, offset: Number(riff.downbeatOffset) || 0 });
    paintLoop();
    paintSpeed();
    renderPicker(riff.id);
    setStatus(`${riff.title} — space to play`);
  }

  async function renameRiff(riff) {
    if (!riff) return;
    const next = window.prompt('Song name', riff.title || '');
    if (next == null) return;
    const title = next.trim();
    if (!title || title === riff.title) return;
    const res = await fetch(`/api/riffs/${riff.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    if (state.riff?.id === riff.id) openRiff(updated);
    else await refreshList(state.riff?.id);
  }

  async function deleteRiff(riff) {
    if (!riff) return;
    if (!window.confirm(`Delete “${riff.title || 'this song'}” from the library on this Mac?`)) return;
    const res = await fetch(`/api/riffs/${riff.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    if (state.riff?.id === riff.id) {
      state.riff = null;
      video.removeAttribute('src');
      video.load();
      q('#riff-title').textContent = 'Pick a song';
      q('#riff-by').textContent = '';
      tab.load('');
    }
    await refreshList();
    setStatus('Deleted from this Mac. Sync will fetch it again if the link is still in the queue.');
  }

  async function syncQueue() {
    setStatus('Checking the song queue…');
    const res = await fetch('/api/queue/sync', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) {
      setStatus(body.error || 'Sync failed');
      return;
    }
    poll(body.jobId, { quiet: true });
  }

  async function savePatch(patch) {
    if (!state.riff) return;
    const res = await fetch(`/api/riffs/${state.riff.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    state.riff = await res.json();
    sync.configure({
      bpm: Number(state.riff.bpm) || 80,
      offset: Number(state.riff.downbeatOffset) || 0,
    });
    paintSpeed();
  }

  function commitBpm(value) {
    const bpm = Math.max(40, Math.min(240, Math.round(value * 10) / 10));
    q('#riff-bpm').value = String(bpm);
    if (state.riff) state.riff.bpm = bpm;
    savePatch({ bpm });
    paintSpeed();
  }

  function tapTempo() {
    const now = performance.now();
    state.taps = state.taps.filter((t) => now - t < 2500);
    state.taps.push(now);
    if (state.taps.length < 2) {
      setStatus('Keep tapping…');
      return;
    }
    const gaps = [];
    for (let i = 1; i < state.taps.length; i += 1) gaps.push(state.taps[i] - state.taps[i - 1]);
    const avg = gaps.reduce((sum, n) => sum + n, 0) / gaps.length;
    const bpm = 60000 / avg;
    setStatus(`Tap ${Math.round(bpm)} BPM`);
    commitBpm(bpm);
  }

  function setStatus(text) {
    q('#riff-status').textContent = text;
  }

  async function boot() {
    const asked = new URLSearchParams(location.search).get('view');
    const saved = asked || sessionStorage.getItem('practice-desk-view');
    setView(saved === 'riff' ? 'riff' : 'desk');
    try {
      const health = await fetch('/api/health');
      const body = await health.json();
      const missing = [];
      if (!body.ffmpeg) missing.push('ffmpeg');
      if (!body.ytdlp) missing.push('yt-dlp');
      if (missing.length) {
        q('#riff-helper').hidden = false;
        q('#riff-helper').textContent = `Install ${missing.join(' and ')} (brew install ffmpeg yt-dlp) for link import. A video file still works.`;
      }
    } catch {
      q('#riff-helper').hidden = false;
    }
    await refreshList();
    if (state.library[0]) await openRiffById(state.library[0].id);
    syncQueue();
  }

  boot();
}

function formatAdded(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmt(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}s`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function template() {
  const keyOptions = KEYS.map((key) => `<option>${key}</option>`).join('');
  const drums = Object.entries(DRUM_PATTERNS).map(([id, pattern], index) => (
    `<button type="button" data-drum="${id}" aria-pressed="${index === 0 ? 'true' : 'false'}">${pattern.name}</button>`
  )).join('');
  return `
    <div class="riff-head">
      <div>
        <p class="eyebrow">Riff Room</p>
        <h2 id="riff-title">Pick a song</h2>
        <p class="riff-by" id="riff-by"></p>
        <button id="riff-rename" type="button" class="riff-rename">Rename</button>
      </div>
      <p class="riff-status" id="riff-status">Paste a Facebook, Instagram, or YouTube link.</p>
    </div>
    <p class="riff-helper" id="riff-helper" hidden>The local helper is not running. Start the desk with <code>npm run dev</code>.</p>
    <form class="riff-import" onsubmit="return false">
      <label class="riff-url">
        <span class="sr">Video link</span>
        <input id="riff-url" type="url" placeholder="https://www.facebook.com/share/r/…" autocomplete="off" />
      </label>
      <button id="riff-import" type="button">Import</button>
      <button id="riff-sync" type="button">Sync</button>
      <label class="riff-file">
        Video file
        <input id="riff-file" type="file" accept="video/mp4,video/quicktime,video/*" />
      </label>
    </form>
    <section class="song-picker" aria-label="Song library">
      <div class="grid-head">
        <span class="grid-title">Songs</span>
        <span id="riff-count" class="riff-count">Loading…</span>
      </div>
      <div class="song-tools">
        <input id="riff-search" type="search" placeholder="Search title, player, key" />
        <label>Sort
          <select id="riff-sort">
            <option value="added-desc">Newest</option>
            <option value="added-asc">Oldest</option>
            <option value="title">Title</option>
            <option value="bpm">BPM</option>
          </select>
        </label>
      </div>
      <div id="riff-list" class="song-grid"></div>
    </section>
    <div class="riff-stage">
      <div class="riff-video-wrap">
        <video id="riff-video" playsinline controls></video>
      </div>
      <div class="riff-side">
        <div class="riff-transport">
          <button id="riff-play" type="button" class="play">Play</button>
          <button id="riff-loop" type="button" aria-pressed="true">Loop</button>
          <span id="riff-where" class="riff-where">Bar —</span>
        </div>
        <div class="riff-ab">
          <button id="riff-set-a" type="button">Set A</button>
          <button id="riff-set-b" type="button">Set B</button>
          <button id="riff-clear-ab" type="button">Clear</button>
          <span id="riff-ab-readout">Whole clip</span>
        </div>
        <label class="riff-slider">Speed <output id="riff-speed-readout">100% · kit 80 BPM</output>
          <input id="riff-speed" type="range" min="50" max="100" value="100" />
        </label>
        <label class="riff-slider">Video
          <input id="riff-video-vol" type="range" min="0" max="100" value="80" />
        </label>
        <div class="riff-meta">
          <label>BPM <input id="riff-bpm" type="number" min="40" max="240" step="0.1" value="80" /></label>
          <button id="riff-half" type="button">÷2</button>
          <button id="riff-double" type="button">×2</button>
          <button id="riff-tap" type="button">Tap</button>
          <label>Key
            <select id="riff-key">${keyOptions}</select>
          </label>
          <button id="riff-neck" type="button">Neck</button>
          <label>Downbeat
            <input id="riff-offset" type="number" step="0.05" value="0" />
          </label>
        </div>
        <p class="riff-note" id="riff-bpm-note"></p>
        <p class="riff-note" id="riff-key-note"></p>
        <div class="riff-drums">
          <label class="check"><input id="riff-drums-on" type="checkbox" checked /><span>Drums</span></label>
          <div class="riff-drum-picks">${drums}</div>
          <label class="riff-slider">Kit
            <input id="riff-drum-vol" type="range" min="0" max="100" value="80" />
          </label>
        </div>
        <label class="riff-notes-label">Notes
          <textarea id="riff-notes" rows="2" placeholder="What to listen for"></textarea>
        </label>
      </div>
    </div>
    <section class="riff-panel">
      <div class="grid-head"><span class="grid-title">Tab image</span><span>Stitched from the scrolling frames</span></div>
      <img id="riff-tab-image" alt="Stitched tab" hidden />
      <div id="riff-frames" class="riff-frames"></div>
    </section>
    <section class="riff-panel">
      <div class="grid-head"><span class="grid-title">Playable tab</span><span id="riff-tab-note"></span></div>
      <div id="riff-tab-scroll" class="riff-tab-scroll"><div id="riff-alphatab"></div></div>
      <details class="riff-tex">
        <summary>Edit alphaTex</summary>
        <textarea id="riff-tex" rows="8" spellcheck="false"></textarea>
        <button id="riff-apply-tex" type="button">Update tab</button>
      </details>
    </section>
  `;
}
