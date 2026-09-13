import { currentTracks, formLength, stepsPerBar } from './glory-form.js';
import { state } from './glory-state.js';

const NS = 'http://www.w3.org/2000/svg';
const CX = 210;
const CY = 210;
const OUTER = 168;
const INNER = 112;

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function polar(i, n, radius, offset = -Math.PI / 2) {
  const a = offset + (i / n) * Math.PI * 2;
  return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

function pointsAttr(indices, n, radius) {
  return indices.map((i) => polar(i, n, radius).map((v) => v.toFixed(1)).join(',')).join(' ');
}

function hitIndices(track) {
  return (track || []).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
}

function captionFor(spb) {
  const per = spb / 4;
  if (per === 3) return 'Each quarter note splits into 3 equal beats';
  if (per === 4) return 'Each quarter note splits into 4 sixteenths';
  if (per === 2) return 'Each quarter note splits into 2 eighths';
  return `${spb} pulses per bar`;
}

export function mountGeometry(root) {
  if (!root) return { rebuild() {}, setStep() {} };

  root.innerHTML = `
    <div class="geo-stage">
      <p class="geo-bar" id="geo-bar">Bar<br><strong>1</strong></p>
      <svg viewBox="0 0 420 420" aria-hidden="true"></svg>
    </div>
    <p class="geo-caption" id="geo-caption"></p>
  `;
  const svg = root.querySelector('svg');
  const barEl = root.querySelector('#geo-bar');
  const captionEl = root.querySelector('#geo-caption');

  let n = 16;
  let playhead = null;
  let stepDots = [];

  function rebuild() {
    const tracks = currentTracks() ?? {};
    n = stepsPerBar();
    const kicks = hitIndices(tracks.kick);
    const snares = hitIndices(tracks.snare);
    const hats = hitIndices(tracks.hat);
    const bars = formLength();
    const bar = (state.barIndex % bars) + 1;
    barEl.innerHTML = `Bar<br><strong>${bar}</strong>`;
    captionEl.textContent = captionFor(n);

    svg.replaceChildren();
    svg.appendChild(svgEl('defs', {}));
    const glow = svgEl('radialGradient', { id: 'geo-glow', cx: '50%', cy: '50%', r: '50%' });
    glow.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#5eead4', 'stop-opacity': '0.9' }));
    glow.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#2dd4bf', 'stop-opacity': '0' }));
    svg.querySelector('defs').appendChild(glow);

    svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: 188, fill: '#0b1220' }));
    svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: OUTER, fill: 'none', stroke: 'rgba(232,238,247,0.08)', 'stroke-width': '1' }));
    svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: INNER, fill: 'none', stroke: 'rgba(232,238,247,0.1)', 'stroke-width': '1' }));
    svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: 36, fill: '#0f172a', stroke: 'rgba(232,238,247,0.12)', 'stroke-width': '1' }));

    const diamond = [0, 1, 2, 3];
    svg.appendChild(svgEl('polygon', {
      points: pointsAttr(diamond, 4, OUTER),
      fill: 'none',
      stroke: 'rgba(232,238,247,0.28)',
      'stroke-width': '1.2',
    }));
    for (let i = 0; i < 4; i += 1) {
      const [x, y] = polar(i, 4, OUTER);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 5, fill: i === 0 ? '#e8eef7' : '#94a3b8' }));
      const [lx, ly] = polar(i, 4, OUTER + 22);
      const label = svgEl('text', {
        x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: '#94a3b8', 'font-size': '13', 'font-family': 'Outfit, system-ui, sans-serif',
      });
      label.textContent = String(i + 1);
      svg.appendChild(label);
    }

    if (hats.length) {
      for (const i of hats) {
        const [x, y] = polar(i, n, INNER);
        svg.appendChild(svgEl('circle', {
          cx: x, cy: y, r: 2.2, fill: 'rgba(148,163,184,0.45)',
        }));
      }
    }

    if (snares.length >= 2) {
      svg.appendChild(svgEl('polygon', {
        class: 'geo-snare',
        points: pointsAttr(snares, n, INNER),
        fill: 'rgba(251,191,36,0.12)',
        stroke: '#fbbf24',
        'stroke-width': '1.6',
      }));
    }
    for (const i of snares) {
      const [x, y] = polar(i, n, INNER);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 5, fill: '#fbbf24' }));
    }

    if (kicks.length >= 2) {
      svg.appendChild(svgEl('polygon', {
        class: 'geo-kick',
        points: pointsAttr(kicks, n, INNER),
        fill: 'rgba(45,212,191,0.16)',
        stroke: '#2dd4bf',
        'stroke-width': '2',
      }));
    }
    for (const i of kicks) {
      const [x, y] = polar(i, n, INNER);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 6.5, fill: '#2dd4bf' }));
    }

    if (n <= 12) {
      for (let i = 0; i < n; i += 1) {
        const [x, y] = polar(i, n, INNER - 22);
        const t = svgEl('text', {
          x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: 'rgba(232,238,247,0.4)', 'font-size': '10',
          'font-family': 'Outfit, system-ui, sans-serif',
        });
        t.textContent = String(i + 1);
        svg.appendChild(t);
      }
    }

    stepDots = [];
    for (let i = 0; i < n; i += 1) {
      const [x, y] = polar(i, n, INNER);
      const dot = svgEl('circle', {
        class: 'geo-step',
        cx: x, cy: y, r: 3,
        fill: 'rgba(232,238,247,0.18)',
      });
      svg.appendChild(dot);
      stepDots.push(dot);
    }

    const ray = svgEl('line', {
      class: 'geo-ray',
      x1: CX, y1: CY, x2: CX, y2: CY - INNER,
      stroke: 'rgba(45,212,191,0.85)',
      'stroke-width': '1.4',
    });
    playhead = svgEl('g', { class: 'geo-playhead' });
    playhead.appendChild(svgEl('circle', { r: 16, fill: 'url(#geo-glow)', cx: 0, cy: 0 }));
    playhead.appendChild(svgEl('circle', { r: 7, fill: '#fff', cx: 0, cy: 0 }));
    playhead.appendChild(svgEl('circle', {
      r: 11, fill: 'none', stroke: '#5eead4', 'stroke-width': '1.5', cx: 0, cy: 0,
    }));
    svg.appendChild(ray);
    svg.appendChild(playhead);
    playhead._ray = ray;
    setStep(state.step);
  }

  function setStep(stepIndex) {
    if (!playhead) return;
    const i = stepIndex < 0 ? 0 : stepIndex % n;
    const [x, y] = polar(i, n, INNER);
    playhead.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    if (playhead._ray) {
      playhead._ray.setAttribute('x2', x.toFixed(1));
      playhead._ray.setAttribute('y2', y.toFixed(1));
      playhead._ray.setAttribute('opacity', stepIndex < 0 ? '0.2' : '1');
    }
    playhead.setAttribute('opacity', stepIndex < 0 ? '0.35' : '1');
    stepDots.forEach((dot, idx) => {
      dot.setAttribute('r', idx === i && stepIndex >= 0 ? '5' : '3');
      dot.setAttribute('fill', idx === i && stepIndex >= 0 ? '#e8eef7' : 'rgba(232,238,247,0.18)');
    });
  }

  rebuild();
  return { rebuild, setStep };
}
