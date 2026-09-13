const MAX = 12;
const lines = [];

function paint() {
  const logEl = document.getElementById('debug-log');
  const hudEl = document.getElementById('debug-hud');
  if (logEl) logEl.textContent = lines.join('\n');
  if (hudEl) hudEl.textContent = hudEl.dataset.hud || '';
}

export function debugHud(text) {
  const hudEl = document.getElementById('debug-hud');
  if (hudEl) {
    hudEl.dataset.hud = text;
    hudEl.textContent = text;
  }
}

export function debugLog(msg, extra) {
  const t = new Date().toISOString().slice(11, 23);
  const bit = extra !== undefined ? ` ${JSON.stringify(extra)}` : '';
  const line = `${t} ${msg}${bit}`;
  lines.push(line);
  if (lines.length > MAX) lines.shift();
  console.log(`[desk] ${msg}`, extra ?? '');
  paint();
}

export function debugError(msg, err) {
  debugLog(`ERROR ${msg}`, String(err?.message || err));
  const errEl = document.getElementById('debug-err');
  if (errEl) errEl.textContent = String(err?.message || err);
}

export function mountDebug() {
  paint();
  window.addEventListener('error', (e) => debugError('window', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => debugError('promise', e.reason));
}
