/**
 * Phone helpers: unlocking media on iOS, and keeping the screen awake while
 * something is playing.
 */

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const primed = new WeakSet();

/**
 * iOS only lets a media element start from a tap. Calling play() and pause()
 * inside the tap unlocks it, so later play() calls (after a count-in, or
 * from another element's play event) are allowed. Call from a click handler,
 * before any await. Returns true if it primed the element just now.
 */
export function primeMedia(el) {
  if (!isIOS || !el || primed.has(el)) return false;
  primed.add(el);
  const attempt = el.play();
  el.pause();
  attempt?.catch?.(() => {});
  return true;
}

// ---- Screen wake lock ----------------------------------------------------

const holders = new Set();
let lock = null;
let pending = null;

async function acquire() {
  if (lock || pending || !holders.size || !navigator.wakeLock) return;
  try {
    pending = navigator.wakeLock.request('screen');
    lock = await pending;
    lock.addEventListener('release', () => { lock = null; });
  } catch {
    lock = null; // denied, battery saver, or not visible
  } finally {
    pending = null;
  }
  if (!holders.size) release();
}

function release() {
  const current = lock;
  lock = null;
  current?.release?.().catch?.(() => {});
}

/** Keep the screen on while any holder ('desk', 'riff', 'session') wants it. */
export function keepAwake(holder, on) {
  if (on) holders.add(holder);
  else holders.delete(holder);
  if (holders.size) acquire();
  else release();
}

if (typeof document !== 'undefined') {
  // The browser drops the lock when the tab is hidden; take it back on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') acquire();
  });
}

/** For tests. */
export function awakeHolders() {
  return [...holders];
}
