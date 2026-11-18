/**
 * Riff Room "Theory" panel: the lick on the neck, what it is made of, the
 * scale in one card, "make it yours" exercises, and a fret fixer for notes
 * the tab reader got wrong. Fed by the riff's alphaTex and key; follows the
 * playing bar.
 */
import * as Tone from 'tone';
import { notesFromTex } from '../theory/notes.js';
import { analyzeLick, STRING_PCS } from '../theory/analyze.js';
import { explainLick } from '../theory/lessons.js';
import { renderNeck } from '../theory/neck.js';
import { degreeOf, pcName } from '../theory/scales.js';
import { replaceNotes, texNotesMatch } from '../theory/texedit.js';

const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
/** MIDI note of each open string, low E → high e. */
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function theoryPanelHtml() {
  const strings = STRING_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).reverse().join('');
  return `
    <section class="riff-panel theory-panel" id="riff-theory" aria-label="Theory">
      <div class="grid-head">
        <span class="grid-title">Theory</span>
        <span id="theory-sub"></span>
      </div>
      <div id="theory-empty" class="riff-note">Load a riff with a playable tab to see what it is made of.</div>
      <div id="theory-body" hidden>
        <div class="theory-top">
          <h3 id="theory-headline"></h3>
          <div class="theory-toggles" role="group" aria-label="Neck labels">
            <button type="button" data-labels="degrees" aria-pressed="true">Degrees</button>
            <button type="button" data-labels="notes" aria-pressed="false">Notes</button>
            <button type="button" data-follow aria-pressed="true" title="Highlight the bar that is playing">Follow bar</button>
          </div>
        </div>
        <p class="riff-note" id="theory-keynote"></p>
        <div id="theory-neck" class="theory-neck"></div>
        <p class="theory-legend">
          <span class="key root"></span>Root
          <span class="key chord"></span>Chord tone
          <span class="key scale"></span>Scale note
          <span class="key outside"></span>Outside the scale
          <span class="key ghost"></span>Rest of the scale
        </p>
        <p class="riff-note theory-fix-hint" id="theory-fix-hint">Click a note to hear it. If it sounds wrong against the video, fix its fret.</p>
        <div id="theory-bars" class="theory-bars" aria-label="Notes bar by bar"></div>
        <div id="theory-editor" class="theory-editor" hidden>
          <p id="theory-edit-what" class="theory-edit-what"></p>
          <div class="theory-edit-row">
            <label class="riff-inline">String <select id="theory-edit-string">${strings}</select></label>
            <label class="riff-inline">Fret <input id="theory-edit-fret" type="number" min="0" max="24" /></label>
            <output id="theory-edit-result" class="theory-edit-result"></output>
          </div>
          <label class="check riff-inline" id="theory-edit-all-label"><input type="checkbox" id="theory-edit-all" /><span id="theory-edit-all-text"></span></label>
          <div class="theory-edit-row">
            <button type="button" id="theory-edit-hear">Hear it</button>
            <button type="button" id="theory-edit-apply" class="primary">Apply fix</button>
            <button type="button" id="theory-edit-cancel">Close</button>
          </div>
        </div>
        <p class="theory-undo-row"><button type="button" id="theory-undo" hidden>Undo last fix</button><span id="theory-edit-status" class="riff-note"></span></p>
        <div class="theory-cols">
          <div>
            <h4>What it's made of</h4>
            <ul id="theory-facts" class="theory-facts"></ul>
          </div>
          <div class="theory-concept">
            <h4 id="theory-concept-title"></h4>
            <p id="theory-formula" class="theory-formula"></p>
            <p id="theory-concept-text"></p>
            <button type="button" id="theory-jam">Jam this on the Desk</button>
          </div>
        </div>
        <h4>Make it yours</h4>
        <ol id="theory-prompts" class="theory-prompts"></ol>
      </div>
    </section>`;
}

/**
 * @param root      element containing theoryPanelHtml()
 * @param handlers  { onLoopBar(barIndex0), onJam({ rootPc, scaleId, patternId }), onTexChange(tex) }
 */
export function mountTheoryPanel(root, handlers = {}) {
  const q = (sel) => root.querySelector(sel);
  const view = {
    analysis: null,
    tex: '',
    key: '',
    editable: false,
    labels: 'degrees',
    follow: true,
    bar: null,
    selected: null, // { index, same: [indexes at the same string/fret] }
    undo: [],
  };
  let pluck = null;

  root.querySelectorAll('[data-labels]').forEach((btn) => {
    btn.addEventListener('click', () => {
      view.labels = btn.dataset.labels;
      root.querySelectorAll('[data-labels]').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
      paintNeck();
      paintBars();
    });
  });
  q('[data-follow]').addEventListener('click', () => {
    view.follow = !view.follow;
    q('[data-follow]').setAttribute('aria-pressed', view.follow ? 'true' : 'false');
    paintNeck();
  });
  q('#theory-jam').addEventListener('click', () => {
    const a = view.analysis;
    if (!a) return;
    handlers.onJam?.({
      rootPc: a.key.rootPc,
      scaleId: a.scale.id,
      patternId: a.box ? `box-${a.box.index}` : 'all',
    });
  });

  // Fret fixer
  q('#theory-neck').addEventListener('click', (event) => {
    const dot = event.target.closest('[data-pos]');
    if (!dot) return;
    const [string, fret] = dot.dataset.pos.split(':').map(Number);
    const here = view.analysis.notes.filter((n) => n.string === string && n.fret === fret);
    const inBar = here.find((n) => n.bar === view.bar) || here[0];
    if (inBar) select(inBar.index);
  });
  q('#theory-neck').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.target.closest('[data-pos]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  q('#theory-edit-string').addEventListener('change', () => { paintEditResult(); hearDraft(); });
  q('#theory-edit-fret').addEventListener('input', () => { paintEditResult(); hearDraft(); });
  q('#theory-edit-hear').addEventListener('click', hearDraft);
  q('#theory-edit-cancel').addEventListener('click', () => select(null));
  q('#theory-edit-apply').addEventListener('click', applyFix);
  q('#theory-undo').addEventListener('click', () => {
    const previous = view.undo.pop();
    if (previous == null) return;
    handlers.onTexChange?.(previous);
    q('#theory-edit-status').textContent = 'Undone.';
    q('#theory-undo').hidden = view.undo.length === 0;
  });

  function noteByIndex(index) {
    return view.analysis?.notes.find((n) => n.index === index) ?? null;
  }

  function draft() {
    const string = Number(q('#theory-edit-string').value);
    const fret = Math.max(0, Math.min(24, Math.round(Number(q('#theory-edit-fret').value) || 0)));
    const midi = OPEN_MIDI[string] + fret;
    return { string, fret, midi, pc: (STRING_PCS[string] + fret) % 12 };
  }

  async function play(midi) {
    try {
      await Tone.start();
      if (!pluck) pluck = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.92 }).toDestination();
      pluck.triggerAttack(Tone.Frequency(midi, 'midi').toFrequency(), Tone.now() + 0.01);
    } catch {
      /* audio blocked until the first click; ignore */
    }
  }

  function hearDraft() {
    if (view.selected) play(draft().midi);
  }

  function select(index) {
    const note = index == null ? null : noteByIndex(index);
    if (!note) {
      view.selected = null;
      q('#theory-editor').hidden = true;
      paintNeck();
      paintBars();
      return;
    }
    play(note.midi);
    const same = view.analysis.notes.filter((n) => n.string === note.string && n.fret === note.fret).map((n) => n.index);
    view.selected = { index, same };
    const editor = q('#theory-editor');
    editor.hidden = !view.editable;
    if (view.editable) {
      q('#theory-edit-what').textContent = `Bar ${note.bar + 1}, beat ${(note.beat + 1).toFixed(2).replace(/\.?0+$/, '')}: ${STRING_NAMES[note.string]} string, fret ${note.fret} (${pcName(note.pc)}, the ${note.degree}).`;
      q('#theory-edit-string').value = String(note.string);
      q('#theory-edit-fret').value = String(note.fret);
      q('#theory-edit-all').checked = false;
      q('#theory-edit-all-label').hidden = same.length < 2;
      q('#theory-edit-all-text').textContent = `Change all ${same.length} notes at this spot`;
      paintEditResult();
    }
    paintNeck();
    paintBars();
  }

  function paintEditResult() {
    if (!view.selected || !view.analysis) return;
    const d = draft();
    const degree = degreeOf(d.pc, view.analysis.key.rootPc);
    const inScale = view.analysis.scale.intervals.includes((((d.pc - view.analysis.key.rootPc) % 12) + 12) % 12);
    q('#theory-edit-result').textContent = `→ ${pcName(d.pc)}, the ${degree}${inScale ? '' : ' (outside the scale)'}`;
  }

  function applyFix() {
    if (!view.selected || !view.editable) return;
    const d = draft();
    const note = noteByIndex(view.selected.index);
    const indexes = q('#theory-edit-all').checked ? view.selected.same : [view.selected.index];
    const next = replaceNotes(view.tex, indexes, { fret: d.fret, string: d.string });
    if (next === view.tex) {
      select(null);
      return;
    }
    view.undo.push(view.tex);
    if (view.undo.length > 20) view.undo.shift();
    q('#theory-undo').hidden = false;
    const where = indexes.length > 1 ? `${indexes.length} notes` : `bar ${note.bar + 1}`;
    q('#theory-edit-status').textContent = `Fixed ${where}: ${STRING_NAMES[note.string]} ${note.fret} → ${STRING_NAMES[d.string]} ${d.fret}.`;
    view.selected = null;
    q('#theory-editor').hidden = true;
    handlers.onTexChange?.(next);
  }

  function paintNeck() {
    if (!view.analysis) return;
    const bar = view.follow ? view.bar : null;
    const selected = view.selected ? (q('#theory-edit-all')?.checked ? view.selected.same : [view.selected.index]) : [];
    q('#theory-neck').innerHTML = renderNeck(view.analysis, { labels: view.labels, bar, selected });
    root.querySelectorAll('.theory-bar').forEach((el) => {
      el.classList.toggle('now', bar != null && Number(el.dataset.bar) === bar);
    });
  }

  function paintBars() {
    const a = view.analysis;
    if (!a) return;
    const byBar = new Map();
    for (const n of a.notes) {
      if (!byBar.has(n.bar)) byBar.set(n.bar, []);
      byBar.get(n.bar).push(n);
    }
    const picked = view.selected?.index;
    q('#theory-bars').innerHTML = [...byBar.entries()].map(([bar, notes]) => `
      <div class="theory-bar" data-bar="${bar}">
        <div class="theory-bar-head">
          <span class="theory-bar-num">Bar ${bar + 1}</span>
          <button type="button" class="theory-bar-loop" data-loop="${bar}" title="Loop bar ${bar + 1}">Loop</button>
        </div>
        <div class="theory-bar-notes">${notes.map((n, i) => {
          const chord = i > 0 && notes[i - 1].beat === n.beat;
          const label = view.labels === 'notes' ? pcName(n.pc) : n.degree;
          const bend = n.bendTo != null ? `↗${view.labels === 'notes' ? pcName(n.bendTo) : degreeOf(n.bendTo, a.key.rootPc)}` : '';
          const cls = `note-chip${n.inScale ? '' : ' outside'}${chord ? ' chord' : ''}${n.index === picked ? ' picked' : ''}`;
          return `<button type="button" class="${cls}" data-index="${n.index}" title="${STRING_NAMES[n.string]} string, fret ${n.fret}">${esc(label)}${esc(bend)}</button>`;
        }).join('')}</div>
      </div>`).join('');
    root.querySelectorAll('.note-chip').forEach((el) => {
      el.addEventListener('click', () => select(Number(el.dataset.index)));
    });
    root.querySelectorAll('[data-loop]').forEach((el) => {
      el.addEventListener('click', () => handlers.onLoopBar?.(Number(el.dataset.loop)));
    });
    const bar = view.follow ? view.bar : null;
    root.querySelectorAll('.theory-bar').forEach((el) => {
      el.classList.toggle('now', bar != null && Number(el.dataset.bar) === bar);
    });
  }

  /** Re-run the analysis for a riff's tab and key. */
  function update({ alphatex, key }) {
    const tex = alphatex || '';
    if (tex !== view.tex) view.selected = null;
    if (key !== undefined) view.key = key;
    const { notes, total, error } = notesFromTex(tex);
    const analysis = notes.length ? analyzeLick(notes, { key: view.key }) : null;
    view.tex = tex;
    view.analysis = analysis;
    view.editable = Boolean(analysis) && texNotesMatch(tex, total);
    q('#theory-body').hidden = !analysis;
    q('#theory-empty').hidden = Boolean(analysis);
    q('#theory-editor').hidden = true;
    if (!analysis) {
      q('#theory-empty').textContent = error
        ? `The playable tab has an error, so there is nothing to analyse yet (${error}).`
        : 'Load a riff with a playable tab to see what it is made of.';
      q('#theory-sub').textContent = '';
      return null;
    }
    q('#theory-fix-hint').textContent = view.editable
      ? 'Click a note to hear it. If it sounds wrong against the video, fix its fret.'
      : 'Click a note to hear it. Fret fixing is off for this tab: it uses syntax the fixer does not know, so use Edit alphaTex.';
    const text = explainLick(analysis);
    q('#theory-headline').textContent = text.headline;
    q('#theory-sub').textContent = text.sub;
    q('#theory-keynote').textContent = text.keyNote;
    q('#theory-keynote').hidden = !text.keyNote;
    q('#theory-facts').innerHTML = text.facts.map((f) => `<li>${esc(f)}</li>`).join('');
    q('#theory-concept-title').textContent = text.concept.title;
    q('#theory-formula').textContent = text.concept.formula;
    q('#theory-concept-text').textContent = text.concept.text;
    q('#theory-prompts').innerHTML = text.prompts
      .map((p) => `<li><strong>${esc(p.title)}</strong><span>${esc(p.text)}</span></li>`)
      .join('');
    paintBars();
    paintNeck();
    return analysis;
  }

  /** A different riff: forget its undo history. */
  function reset() {
    view.undo = [];
    view.selected = null;
    q('#theory-undo').hidden = true;
    q('#theory-edit-status').textContent = '';
  }

  /** Called as the video plays; bar is 0-based, or null before bar 1. */
  function setBar(bar) {
    const next = bar == null || bar < 0 ? null : bar;
    if (next === view.bar) return;
    view.bar = next;
    if (view.follow) paintNeck();
  }

  return { update, reset, setBar, get analysis() { return view.analysis; } };
}
