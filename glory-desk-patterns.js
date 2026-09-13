import index from './patterns/index.json';
import { readCustoms, deleteCustom } from './glory-composer.js';
import { readFavs, isFav, toggleFav, removeFav } from './glory-favs.js';
import { state } from './glory-state.js';

export function attachPatterns(api) {
  const {
    catalog, engine, Tone,
    chipsEl, patternName, patternSub,
    setBpm, persistSession, stop, start,
  } = api;

  function resolvePattern(id) {
    if (!id) return null;
    if (catalog[id]) return catalog[id];
    return readCustoms().find((p) => p.id === id) ?? null;
  }

  function syncChipSelection() {
    chipsEl.querySelectorAll('.chip').forEach((el) => {
      el.setAttribute('aria-selected', el.dataset.id === state.currentId ? 'true' : 'false');
    });
  }

  function applyLoadedPattern({ applyDefaultBpm = true } = {}) {
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

  function loadPattern(pattern, { applyDefaultBpm = true } = {}) {
    if (!pattern?.id) throw new Error('Invalid pattern');
    state.pattern = pattern;
    state.currentId = pattern.id;
    if (!String(pattern.id).startsWith('composer-preview-')) {
      state.lastRealPatternId = pattern.id;
    }
    applyLoadedPattern({ applyDefaultBpm });
  }

  function loadPatternById(id, { applyDefaultBpm = true } = {}) {
    const next = resolvePattern(id);
    if (!next) throw new Error(`Unknown pattern: ${id}`);
    loadPattern(next, { applyDefaultBpm });
  }

  function sectionHeading(text) {
    const heading = document.createElement('div');
    heading.className = 'chip-section';
    heading.textContent = text;
    return heading;
  }

  function makeChip(data, { custom = false } = {}) {
    const faved = isFav(data.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = custom ? 'chip custom' : 'chip';
    if (faved) btn.classList.add('faved');
    btn.dataset.id = data.id;
    btn.setAttribute('role', 'option');
    btn.draggable = true;
    const bars = data.form?.length || data.tracksByBar?.length || 1;
    const tag = bars > 1 ? `${bars}-bar` : '';
    const sub = custom ? (tag ? `${tag} - Custom` : 'Custom') : `${tag ? `${tag} - ` : ''}${data.subtitle ?? ''}`;
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = data.name;
    const small = document.createElement('small');
    small.textContent = sub;
    btn.append(name, small);
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-practice-pattern', data.id);
      e.dataTransfer.setData('text/plain', data.id);
    });
    btn.addEventListener('click', async () => {
      const wasPlaying = state.playing;
      if (wasPlaying) stop();
      loadPatternById(data.id);
      if (wasPlaying) await start({ skipCountIn: true });
    });

    const wrap = document.createElement('div');
    wrap.className = 'chip-wrap';
    const star = document.createElement('button');
    star.type = 'button';
    star.className = `chip-fav${faved ? ' on' : ''}`;
    star.title = faved ? 'Remove from favourites' : 'Add to favourites';
    star.setAttribute('aria-pressed', faved ? 'true' : 'false');
    star.setAttribute('aria-label', faved ? `Unfavourite ${data.name}` : `Favourite ${data.name}`);
    star.textContent = faved ? '★' : '☆';
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(data.id);
      star.blur();
      renderChips();
    });
    wrap.append(star, btn);

    if (custom) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip-del';
      del.title = 'Delete custom form';
      del.setAttribute('aria-label', `Delete ${data.name}`);
      del.textContent = 'x';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete "${data.name}"?`)) return;
        if (deleteCustom(data.id) == null) return;
        removeFav(data.id);
        if (state.currentId === data.id) {
          const wasPlaying = state.playing || state.countingIn;
          if (wasPlaying) stop();
          const fallback = index[0]?.id;
          if (fallback) loadPatternById(fallback);
          if (wasPlaying) await start({ skipCountIn: true });
        }
        renderChips();
      });
      wrap.appendChild(del);
    }
    return wrap;
  }

  function renderChips() {
    chipsEl.innerHTML = '';
    const customs = readCustoms();
    const favIds = readFavs();
    const byId = new Map();
    for (const item of index) {
      const data = catalog[item.id];
      if (data) byId.set(data.id, { data, custom: false });
    }
    for (const data of customs) byId.set(data.id, { data, custom: true });

    const favs = favIds.map((id) => byId.get(id)).filter(Boolean);
    if (favs.length) {
      chipsEl.appendChild(sectionHeading('Favourites'));
      for (const { data, custom } of favs) chipsEl.appendChild(makeChip(data, { custom }));
    }
    if (customs.length) {
      chipsEl.appendChild(sectionHeading('My forms'));
      for (const data of customs) chipsEl.appendChild(makeChip(data, { custom: true }));
    }
    chipsEl.appendChild(sectionHeading('Presets'));
    for (const item of index) {
      const data = catalog[item.id];
      if (!data) continue;
      chipsEl.appendChild(makeChip(data));
    }
    syncChipSelection();
  }

  return { resolvePattern, renderChips, syncChipSelection, loadPattern, loadPatternById };
}
