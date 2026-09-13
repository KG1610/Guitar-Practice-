import { state } from './glory-state.js';
import { currentBar, currentTracks, formLength } from './glory-form.js';

export const CUSTOMS_KEY = 'practice-desk-customs-v1';

export function readCustoms() {
  try {
    const raw = localStorage.getItem(CUSTOMS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.form) && p.form.length);
  } catch {
    return [];
  }
}

export function writeCustoms(list) {
  try {
    localStorage.setItem(CUSTOMS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function deleteCustom(id) {
  const next = readCustoms().filter((p) => p.id !== id);
  if (!writeCustoms(next)) return null;
  return next;
}

function cloneTracks(src = {}) {
  return {
    kick: [...(src.kick || [])],
    snare: [...(src.snare || [])],
    hat: [...(src.hat || [])],
  };
}

function gridOf(pattern, tracks) {
  const fromPattern = Number(pattern?.stepsPerBar);
  if (fromPattern) return fromPattern;
  const len = tracks?.kick?.length || tracks?.snare?.length || tracks?.hat?.length;
  return len || 16;
}

export function extractBar(pattern, barIndex = 0) {
  if (!pattern) return null;
  if (pattern.form?.length) {
    const idx = ((barIndex % pattern.form.length) + pattern.form.length) % pattern.form.length;
    const b = pattern.form[idx];
    return {
      label: b.label || pattern.name || `Bar ${idx + 1}`,
      ...cloneTracks(b),
      sourceId: pattern.id,
      sourceBar: idx,
      stepsPerBar: gridOf(pattern, b),
    };
  }
  if (pattern.tracksByBar?.length) {
    const idx = ((barIndex % pattern.tracksByBar.length) + pattern.tracksByBar.length) % pattern.tracksByBar.length;
    const b = pattern.tracksByBar[idx];
    return {
      label: b.label || pattern.name || `Bar ${idx + 1}`,
      ...cloneTracks(b),
      sourceId: pattern.id,
      sourceBar: idx,
      stepsPerBar: gridOf(pattern, b),
    };
  }
  if (pattern.tracks) {
    return {
      label: pattern.name || 'Bar',
      ...cloneTracks(pattern.tracks),
      sourceId: pattern.id,
      sourceBar: 0,
      stepsPerBar: gridOf(pattern, pattern.tracks),
    };
  }
  return null;
}

export function extractCurrentBar() {
  const pattern = state.pattern;
  if (!pattern) return null;
  const tracks = currentTracks();
  if (!tracks?.kick && !tracks?.snare && !tracks?.hat) {
    return extractBar(pattern, state.barIndex || 0);
  }
  const n = Math.max(1, formLength());
  const idx = ((state.barIndex % n) + n) % n;
  const bar = currentBar();
  return {
    label: bar?.label || pattern.name || `Bar ${idx + 1}`,
    ...cloneTracks(tracks),
    sourceId: pattern.id,
    sourceBar: idx,
    stepsPerBar: gridOf(pattern, tracks),
  };
}

export function slotGrids(slots) {
  return [...new Set(
    slots.filter(Boolean).map((b) => Number(b.stepsPerBar) || b.kick?.length || 16),
  )];
}

export function buildPatternFromSlots(slots, {
  id,
  name,
  stepsPerBar,
  bpmDefault = 90,
} = {}) {
  const filled = slots.filter(Boolean);
  if (!filled.length) return null;
  const grids = slotGrids(slots);
  if (grids.length > 1) {
    const err = new Error('mixed-grid');
    err.grids = grids;
    throw err;
  }
  const grid = Number(stepsPerBar) || grids[0] || 16;
  return {
    id: id || `custom-${Date.now().toString(36)}`,
    name: name || 'Custom form',
    subtitle: 'Custom',
    description: 'Assembled in Form Composer',
    bpmDefault,
    stepsPerBar: grid,
    form: filled.map((b, i) => ({
      label: b.label || `Bar ${i + 1}`,
      kick: [...(b.kick || [])],
      snare: [...(b.snare || [])],
      hat: [...(b.hat || [])],
    })),
    custom: true,
  };
}

function emptySlots(n) {
  return Array.from({ length: n }, () => null);
}

export function mountComposer(root, api) {
  let length = 4;
  let slots = emptySlots(length);
  let dragFromSlot = null;

  const lengthGroup = root.querySelector('[data-composer-length]');
  const slotsEl = root.querySelector('[data-composer-slots]');
  const addBtn = root.querySelector('[data-composer-add]');
  const clearBtn = root.querySelector('[data-composer-clear]');
  const playBtn = root.querySelector('[data-composer-play]');
  const saveBtn = root.querySelector('[data-composer-save]');
  const statusEl = root.querySelector('[data-composer-status]');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function firstEmptyIndex() {
    return slots.findIndex((s) => !s);
  }

  function renderSlots() {
    slotsEl.innerHTML = '';
    slots.forEach((bar, i) => {
      const cell = document.createElement('div');
      cell.className = `composer-slot${bar ? ' filled' : ''}`;
      cell.dataset.slot = String(i);
      cell.setAttribute('role', 'listitem');
      cell.tabIndex = 0;
      cell.setAttribute('aria-label', bar
        ? `Slot ${i + 1}: ${bar.label}. Drop to replace, drag to reorder.`
        : `Empty slot ${i + 1}. Drop a pattern here.`);

      const num = document.createElement('span');
      num.className = 'composer-slot-num';
      num.textContent = String(i + 1);

      const label = document.createElement('span');
      label.className = 'composer-slot-label';
      label.textContent = bar ? bar.label : 'Empty';

      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'composer-slot-clear';
      clear.title = 'Clear slot';
      clear.setAttribute('aria-label', `Clear slot ${i + 1}`);
      clear.textContent = 'x';
      clear.hidden = !bar;
      clear.addEventListener('click', (e) => {
        e.stopPropagation();
        slots[i] = null;
        renderSlots();
        setStatus(`Cleared slot ${i + 1}`);
      });

      cell.append(num, label, clear);

      cell.draggable = Boolean(bar);
      cell.addEventListener('dragstart', (e) => {
        if (!bar) {
          e.preventDefault();
          return;
        }
        dragFromSlot = i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-composer-slot', String(i));
        cell.classList.add('dragging');
      });
      cell.addEventListener('dragend', () => {
        dragFromSlot = null;
        cell.classList.remove('dragging');
        slotsEl.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });

      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-composer-slot')
          ? 'move'
          : 'copy';
        cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        handleDropOnSlot(i, e);
      });

      slotsEl.appendChild(cell);
    });
  }

  function placeBar(bar, targetIndex = null) {
    if (!bar) {
      setStatus('Nothing to add - load a pattern first');
      return false;
    }
    let idx = targetIndex;
    if (idx == null || idx < 0 || idx >= slots.length) {
      idx = firstEmptyIndex();
    }
    if (idx < 0) {
      setStatus('Form is full - clear a slot or switch to 8 bars');
      return false;
    }
    slots[idx] = {
      label: bar.label,
      kick: [...bar.kick],
      snare: [...bar.snare],
      hat: [...bar.hat],
      sourceId: bar.sourceId,
      sourceBar: bar.sourceBar,
      stepsPerBar: bar.stepsPerBar || bar.kick?.length || 16,
    };
    renderSlots();
    setStatus(`Added "${bar.label}" -> slot ${idx + 1}`);
    return true;
  }

  function handleDropOnSlot(slotIndex, e) {
    const mimeFrom = e.dataTransfer.getData('application/x-composer-slot');
    const from = dragFromSlot != null
      ? dragFromSlot
      : (mimeFrom !== '' ? Number(mimeFrom) : NaN);
    if (Number.isFinite(from) && from !== slotIndex && slots[from]) {
      const tmp = slots[slotIndex];
      slots[slotIndex] = slots[from];
      slots[from] = tmp;
      dragFromSlot = null;
      renderSlots();
      setStatus(`Moved to slot ${slotIndex + 1}`);
      return;
    }
    const patternId = e.dataTransfer.getData('application/x-practice-pattern')
      || e.dataTransfer.getData('text/plain');
    if (!patternId) return;
    const pattern = api.resolvePattern(patternId);
    if (!pattern) {
      setStatus(`Unknown pattern: ${patternId}`);
      return;
    }
    const bar = state.pattern?.id === patternId ? extractCurrentBar() : extractBar(pattern, 0);
    placeBar(bar, slotIndex);
  }

  function setLength(n, { quiet = false } = {}) {
    const next = n === 8 ? 8 : 4;
    if (next !== length) {
      const prev = slots;
      length = next;
      slots = emptySlots(length);
      for (let i = 0; i < Math.min(prev.length, length); i += 1) slots[i] = prev[i];
    }
    lengthGroup?.querySelectorAll('[data-len]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.len === String(length) ? 'true' : 'false');
    });
    slotsEl.dataset.cols = String(length);
    renderSlots();
    if (!quiet) setStatus(`${length}-bar form`);
  }

  lengthGroup?.querySelectorAll('[data-len]').forEach((btn) => {
    btn.addEventListener('click', () => setLength(Number(btn.dataset.len)));
  });

  addBtn?.addEventListener('click', () => {
    placeBar(extractCurrentBar(), null);
  });

  clearBtn?.addEventListener('click', () => {
    slots = emptySlots(length);
    renderSlots();
    setStatus('Cleared');
  });

  function assemble(id, name) {
    const filled = slots.filter(Boolean);
    if (!filled.length) return null;
    const grids = slotGrids(slots);
    if (grids.length > 1) {
      setStatus(`Mix of ${grids.join(' / ')}-step bars — use one grid`);
      return null;
    }
    return buildPatternFromSlots(slots, {
      id,
      name,
      stepsPerBar: grids[0],
      bpmDefault: api.getBpm?.() ?? 90,
    });
  }

  playBtn?.addEventListener('click', async () => {
    const pattern = assemble(`composer-preview-${Date.now().toString(36)}`, 'Composer form');
    if (!pattern) {
      if (slots.filter(Boolean).length) return;
      setStatus('Add at least one bar first');
      return;
    }
    setStatus(`Playing ${pattern.form.length}-bar form`);
    await api.onPlayForm(pattern);
  });

  saveBtn?.addEventListener('click', () => {
    const filled = slots.filter(Boolean);
    if (!filled.length) {
      setStatus('Add at least one bar before saving');
      return;
    }
    const suggested = `My ${filled.length}-bar`;
    const name = window.prompt('Name this form', suggested);
    if (name == null) return;
    const trimmed = name.trim() || suggested;
    const pattern = assemble(`custom-${Date.now().toString(36)}`, trimmed);
    if (!pattern) return;
    const list = readCustoms();
    list.unshift(pattern);
    if (!writeCustoms(list)) {
      setStatus('Couldn’t save — storage blocked or full');
      return;
    }
    api.onCustomsChanged?.();
    setStatus(`Saved "${trimmed}" under My forms`);
  });

  slotsEl.addEventListener('dragover', (e) => {
    if (e.target === slotsEl) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  slotsEl.addEventListener('drop', (e) => {
    if (e.target !== slotsEl) return;
    e.preventDefault();
    const patternId = e.dataTransfer.getData('application/x-practice-pattern')
      || e.dataTransfer.getData('text/plain');
    if (!patternId || e.dataTransfer.types.includes('application/x-composer-slot')) return;
    const pattern = api.resolvePattern(patternId);
    if (!pattern) return;
    const bar = state.pattern?.id === patternId ? extractCurrentBar() : extractBar(pattern, 0);
    placeBar(bar, null);
  });

  setLength(4, { quiet: true });
  setStatus('Drag chips onto slots - or Add current bar');

  return {
    placeBar,
    getSlots: () => slots.slice(),
    setStatus,
  };
}
