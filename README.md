# Practice Desk — Guitar drums

A tiny Mac-friendly drum player for guitar practice. Real kit sounds (synth drums via Tone.js), not a click track. Patterns live as JSON in git so nothing gets lost.

## Run on Mac

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Click **Play**. Headphones recommended.

## What's in v1

- One rock/strumming groove: kick on 1+3, snare on 2+4, hats on 8ths
- Play / Stop
- BPM 60–160 (default 90)
- Beat indicator
- Pattern file: [`patterns/rock-basic.json`](patterns/rock-basic.json)

## Add a pattern

1. Copy `patterns/rock-basic.json` to a new file under `patterns/`.
2. Edit `tracks.kick`, `tracks.snare`, and `tracks.hat` — arrays of `1`/`0` for each 8th-note step in the bar (`stepsPerBar`, usually 8).
3. Point `main.js` at the new JSON import (library UI comes later).

## Stack

- [Vite](https://vitejs.dev/)
- [Tone.js](https://tonejs.github.io/) (MembraneSynth / NoiseSynth / MetalSynth kit — no sample license baggage)

## Roadmap (not in this pass)

- Chat → generate pattern → commit
- Pattern library UI
- BPM-ramping subdivision drills (rhythm wheel)

## License

MIT for this code. Tone.js is under its own license.
