import * as alphaTab from '@coderline/alphatab';

const TICKS = 960;

export function mountPlayableTab(host, scroller) {
  const cursor = document.createElement('div');
  cursor.className = 'riff-tab-cursor';
  host.style.position = 'relative';
  host.appendChild(cursor);

  let api = null;
  let ready = false;

  api = new alphaTab.AlphaTabApi(host, {
    core: {
      engine: 'svg',
      useWorkers: false,
      logLevel: 'warning',
      fontDirectory: '/alphatab/font/',
    },
    display: {
      layoutMode: alphaTab.LayoutMode.Horizontal,
      staveProfile: alphaTab.StaveProfile.Tab,
    },
    player: {
      playerMode: alphaTab.PlayerMode.Disabled,
    },
  });

  api.error.on((error) => {
    const message = error?.message || String(error);
    console.warn('alphaTab', message);
    ready = false;
  });
  api.renderFinished.on(() => {
    ready = true;
  });

  function load(tex) {
    ready = false;
    cursor.hidden = true;
    try {
      api.tex(tex || '\\tempo (80)\n.\n:1 r |');
    } catch (err) {
      console.warn('alphaTab tex', err);
    }
  }

  function follow(beats) {
    if (!ready || !api.boundsLookup) return;
    const barIndex = Math.max(0, Math.floor(beats / 4));
    const bar = api.boundsLookup.findMasterBarByIndex(barIndex);
    if (!bar) {
      cursor.hidden = true;
      return;
    }
    const bounds = bar.visualBounds || bar.realBounds;
    if (!bounds) return;
    const fraction = Math.min(0.98, Math.max(0, (beats - barIndex * 4) / 4));
    cursor.hidden = false;
    cursor.style.transform = `translate(${bounds.x + bounds.w * fraction}px, ${bounds.y}px)`;
    cursor.style.height = `${bounds.h}px`;
    const scrollerRect = scroller.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const xInScroller = (hostRect.left - scrollerRect.left) + scroller.scrollLeft + bounds.x + bounds.w * fraction;
    const viewLeft = scroller.scrollLeft;
    const viewRight = viewLeft + scroller.clientWidth;
    if (xInScroller < viewLeft + 40 || xInScroller > viewRight - 80) {
      scroller.scrollLeft = Math.max(0, xInScroller - scroller.clientWidth * 0.35);
    }
  }

  function destroy() {
    try { api.destroy(); } catch { /* already gone */ }
    cursor.remove();
  }

  return { load, follow, destroy };
}

export function beatsFromMedia(mediaTime, bpm, downbeatOffset) {
  const safeBpm = bpm > 0 ? bpm : 80;
  return (mediaTime - (downbeatOffset || 0)) * (safeBpm / 60);
}

void TICKS;
