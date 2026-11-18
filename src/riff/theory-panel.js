/**
 * Riff Room "Theory" panel: the lick on the neck, what it is made of, the
 * scale in one card, and "make it yours" exercises. Fed by the riff's
 * alphaTex and key; follows the playing bar.
 */
import { notesFromTex } from '../theory/notes.js';
import { analyzeLick } from '../theory/analyze.js';
import { explainLick } from '../theory/lessons.js';
import { renderNeck } from '../theory/neck.js';

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function theoryPanelHtml() {
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
        <div id="theory-bars" class="theory-bars" aria-label="Degrees bar by bar"></div>
        <div class="theory-cols">
          <div>
            <h4>What it's made of</h4>
            <ul id="theory-facts" class="theory-facts"></ul>
          </div>
          <div class="theory-concept">
            <h4 id="theory-concept-title"></h4>
            <p id="theory-formula" class="theory-formula"></p>
            <p id="theory-concept-text"></p>
            <button type="button" id="theory-jam">Jam this scale on the Desk</button>
          </div>
        </div>
        <h4>Make it yours</h4>
        <ol id="theory-prompts" class="theory-prompts"></ol>
      </div>
    </section>`;
}

/**
 * @param root      element containing theoryPanelHtml()
 * @param handlers  { onLoopBar(barIndex0), onJam({ rootPc, scaleId, patternId }) }
 */
export function mountTheoryPanel(root, handlers = {}) {
  const q = (sel) => root.querySelector(sel);
  const view = { analysis: null, labels: 'degrees', follow: true, bar: null };

  root.querySelectorAll('[data-labels]').forEach((btn) => {
    btn.addEventListener('click', () => {
      view.labels = btn.dataset.labels;
      root.querySelectorAll('[data-labels]').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
      paintNeck();
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

  function paintNeck() {
    if (!view.analysis) return;
    const bar = view.follow ? view.bar : null;
    q('#theory-neck').innerHTML = renderNeck(view.analysis, { labels: view.labels, bar });
    root.querySelectorAll('.theory-bar').forEach((el) => {
      el.classList.toggle('now', bar != null && Number(el.dataset.bar) === bar);
    });
  }

  /** Re-run the analysis for a riff's tab and key. */
  function update({ alphatex, key }) {
    const { notes, error } = notesFromTex(alphatex || '');
    const analysis = notes.length ? analyzeLick(notes, { key }) : null;
    view.analysis = analysis;
    q('#theory-body').hidden = !analysis;
    q('#theory-empty').hidden = Boolean(analysis);
    if (!analysis) {
      q('#theory-empty').textContent = error
        ? `The playable tab has an error, so there is nothing to analyse yet (${error}).`
        : 'Load a riff with a playable tab to see what it is made of.';
      q('#theory-sub').textContent = '';
      return null;
    }
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
    q('#theory-bars').innerHTML = analysis.bars.map((b) => `
      <button type="button" class="theory-bar" data-bar="${b.bar}" title="Loop bar ${b.bar + 1}">
        <span class="theory-bar-num">Bar ${b.bar + 1}</span>
        <span class="theory-bar-degrees">${b.degrees.map(esc).join(' ')}</span>
      </button>`).join('');
    root.querySelectorAll('.theory-bar').forEach((el) => {
      el.addEventListener('click', () => handlers.onLoopBar?.(Number(el.dataset.bar)));
    });
    paintNeck();
    return analysis;
  }

  /** Called as the video plays; bar is 0-based, or null before bar 1. */
  function setBar(bar) {
    const next = bar == null || bar < 0 ? null : bar;
    if (next === view.bar) return;
    view.bar = next;
    if (view.follow) paintNeck();
  }

  return { update, setBar, get analysis() { return view.analysis; } };
}
