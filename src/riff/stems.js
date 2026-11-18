/**
 * Play a riff's split parts (guitar, drums, bass) in step with the video.
 *
 * The video stays the clock: loops, count-in, the kit and the tab all read
 * video.currentTime. Each part is an <audio> element (so slowdown keeps its
 * pitch, like the video) routed through Web Audio for volume, because iOS
 * ignores element.volume. Small drift is corrected by nudging the part's
 * playback rate; big jumps (loops, seeks) by seeking.
 */

export const PARTS = ['guitar', 'drums', 'bass'];

/** Drift beyond this snaps the part to the video (seconds). */
const SEEK_DRIFT = 0.25;
/** Drift beyond this is corrected by nudging the rate (seconds); 5 ms is well under what you can hear. */
const NUDGE_DRIFT = 0.005;
/** Largest rate nudge, as a fraction of the playback rate. */
const MAX_NUDGE = 0.04;

/** Rate multiplier that pulls a part back toward the video. Pure, for tests. */
export function nudgeFor(drift) {
  if (Math.abs(drift) <= NUDGE_DRIFT) return 1;
  // Ahead (drift > 0) → slow down; behind → speed up. Corrects in ~1 s.
  return 1 - Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, drift));
}

export function createStemPlayer(video) {
  let ctx = null;
  let tracks = []; // { part, el, gain }
  let volumes = { guitar: 1, drums: 1, bass: 1 };
  let raf = 0;

  function audioContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function active() {
    return tracks.length > 0;
  }

  function each(fn) {
    for (const t of tracks) fn(t);
  }

  function setGain(t) {
    const v = volumes[t.part] ?? 1;
    // Square law: the slider feels even from loud to quiet.
    t.gain.gain.setTargetAtTime(v * v, audioContext().currentTime, 0.02);
  }

  function load(urls, mix) {
    unload();
    const parts = PARTS.filter((p) => urls?.[p]);
    if (!parts.length) return false;
    const context = audioContext();
    volumes = { ...volumes, ...(mix || {}) };
    tracks = parts.map((part) => {
      const el = new Audio();
      el.preload = 'auto';
      el.preservesPitch = true;
      el.webkitPreservesPitch = true;
      el.src = urls[part];
      const source = context.createMediaElementSource(el);
      const gain = context.createGain();
      source.connect(gain).connect(context.destination);
      const t = { part, el, gain, source };
      setGain(t);
      return t;
    });
    video.muted = true;
    if (!video.paused) play();
    return true;
  }

  function unload() {
    cancelAnimationFrame(raf);
    raf = 0;
    each((t) => {
      t.el.pause();
      t.el.removeAttribute('src');
      t.el.load();
      t.source.disconnect();
      t.gain.disconnect();
    });
    tracks = [];
    video.muted = false;
  }

  function seek() {
    each((t) => {
      t.el.currentTime = video.currentTime;
    });
  }

  async function play() {
    if (!active()) return;
    await audioContext().resume();
    seek();
    each((t) => {
      t.el.playbackRate = video.playbackRate;
      t.el.play().catch(() => {});
    });
    if (!raf) raf = requestAnimationFrame(follow);
  }

  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
    each((t) => t.el.pause());
  }

  function follow() {
    raf = 0;
    if (!active() || video.paused) return;
    const rate = video.playbackRate || 1;
    each((t) => {
      if (t.el.paused || t.el.seeking) return;
      const drift = t.el.currentTime - video.currentTime;
      if (Math.abs(drift) > SEEK_DRIFT) {
        t.el.currentTime = video.currentTime;
        t.el.playbackRate = rate;
      } else {
        t.el.playbackRate = rate * nudgeFor(drift);
      }
    });
    raf = requestAnimationFrame(follow);
  }

  video.addEventListener('play', play);
  video.addEventListener('pause', pause);
  video.addEventListener('seeking', () => { if (active()) seek(); });
  video.addEventListener('ratechange', () => each((t) => { t.el.playbackRate = video.playbackRate; }));

  return {
    load,
    unload,
    get active() { return active(); },
    get volumes() { return { ...volumes }; },
    setVolume(part, value) {
      volumes[part] = Math.max(0, Math.min(1, value));
      each((t) => { if (t.part === part) setGain(t); });
    },
    /** Current times of the video and each part, for checking sync. */
    times() {
      return { video: video.currentTime, parts: Object.fromEntries(tracks.map((t) => [t.part, t.el.currentTime])) };
    },
    /** Largest drift between a part and the video right now (seconds). */
    drift() {
      return tracks.reduce((m, t) => Math.max(m, Math.abs(t.el.currentTime - video.currentTime)), 0);
    },
  };
}
