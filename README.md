# Practice Desk — Metal guitar

Laptop-side drum/click desk for metal practice. Kit + click, 16th grid, count-in, multi-bar looping forms, session memory, riff lock, and neck drills. Patterns live as JSON in git.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Headphones recommended. **Space** starts/stops.

## Glory features

- **Multi-bar forms** — patterns can define a `form` array of 4–8 bars; the player advances bar-by-bar then loops the whole form. Grid + playhead follow the current bar.
- **Chorus lift / verse chug** — original multi-bar metalcore practice beds (inspired energy, not transcriptions).
- **Session memory** — restores pattern, BPM, mix, volume, count-in, ramp, riff lock, and fretboard/drill choices from `localStorage` key `practice-desk-v1`.
- **Riff lock** — optional dark muted pulse under kick hits (Tone.js DuoSynth) so you can lock a chug feel without a full guitar sim.
- **Neck drills** — Off | Roots on 1 | Color on snare | Ascend with click.

## Copyright / inspiration

Feels are **original practice patterns**. Names like “Chorus lift · metalcore” describe vibe only. They are **not** transcriptions of any song (including Forsaken / AILD). Do not paste Songsterr tabs, lyrics, or audio into this repo.

## Default take

Pick **Chorus lift · metalcore** or the classic 16th chug, kit + click, grid visible. Hit Play.

## Feels

| Groove | Subtitle |
|---|---|
| Chorus lift · metalcore | Inspired practice feel — not a transcription |
| Verse chug · 4-bar | Palm-mute groove with bar-4 twist |
| 16th chug | AILD / metalcore |
| Breakdown | AILD / metalcore |
| Gallop | Metal / 1-e-a |
| Accented 16ths | Andy James / shred |
| Straight 8ths | Satriani / rock-metal |
| Double-kick | Metalcore / death-adjacent |
| Rhythm wheel | Subdivision drill |

Mix: **Click / Kit / Both**. Optional 1-bar count-in, BPM ramp, and **Riff lock**.

## Multi-bar form JSON

Prefer a top-level `form` array. Each entry is one bar:

```json
{
  "id": "my-form-4",
  "name": "My 4-bar feel",
  "subtitle": "Practice bed",
  "bpmDefault": 100,
  "stepsPerBar": 16,
  "form": [
    {
      "label": "A",
      "kick":  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      "snare": [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      "hat":   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]
    }
  ]
}
```

Then add `{ "id": "my-form-4", "file": "my-form-4.json" }` to `patterns/index.json`.

Legacy one-bar patterns with only `tracks` still work (treated as a 1-bar form). The rhythm wheel’s `tracksByBar` is also accepted as a form source.

## Fretboard

Default **A harmonic minor**. Switch natural / harmonic / melodic minor, pentatonic, Phrygian, Dorian, major. Ember = root, gold = color tone (the 7 in harmonic minor).

Suggested patterns: all notes, five boxes, 3 notes per string. Notes outside the selected pattern stay dim so you still see the whole neck.

Neck drills pulse matching notes from drum events while the kit/click runs.

## Stack

Vite + Tone.js synth kit. No sample licenses.
