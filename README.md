# Practice Desk — Guitar drums

Mac-friendly drum player for guitar practice. Real kit sounds via Tone.js (not a click). Patterns live as JSON in git.

## Run on Mac

```bash
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Headphones recommended.

## What’s included

- **Library** — rock, pop, ballad, shuffle + subdivision drills
- **Rhythm wheel drill** — cycles common 16th subdivisions bar by bar
- **BPM ramp** — start → target, +BPM every N bars (great for drills)
- **Quick generate** — type `90 rock`, `slow ballad`, `16th drill`, `wheel`
- Play / Stop, live BPM, beat indicator

## Add a pattern

1. Add `patterns/your-groove.json` (see `rock-basic.json`).
2. Register it in `patterns/index.json`.
3. Reload the app.

For multi-bar wheel drills, set `"wheel": true` and provide `tracksByBar` (see `drill-wheel.json`).

## Stack

Vite + Tone.js synth kit (Membrane / Noise / Metal). No sample license baggage.

## Chat → new patterns

Ask Idea Man (or open a PR) to add JSON grooves to `patterns/` — they’ll show up in the library after merge.

## License

MIT for this code. Tone.js under its own license.
