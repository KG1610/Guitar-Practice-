# Practice Desk — Metal guitar

Laptop-side drum/click desk for metal practice. Kit + click, 16th grid, count-in, multi-bar looping forms, session memory, riff lock, and neck drills. Patterns live as JSON in git.

## Run

One click from the repo root:

```bash
./launch
```

That installs npm packages if needed, then starts the desk and the local Riff Room helper. First time on a Mac, also run:

```bash
brew install ffmpeg yt-dlp
chmod +x launch   # once, if ./launch is not executable yet
```

To split riffs into guitar / drums / bass, run this once (about 1–2 GB for PyTorch and Demucs, plus a ~50 MB model):

```bash
./launch --stems      # or: npm run setup:stems
```

Or the long form: `npm install` then `npm start` (same as `npm run dev`).

Open `http://localhost:5173`. Headphones recommended. **Space** starts and stops whatever view you're in (Desk or Riff Room).

`npm start` creates a Python virtualenv (or falls back to `pip install --user` if the machine has no `venv` module), installs the helper's packages, and launches Vite plus the helper on `127.0.0.1:8787`. The desk alone, with no downloader, is `npm run dev:desk`.

## Riff Room

For going from a reel to a loop in under a minute. Mac, local, personal practice. The helper does not send cookies or log into anything.

1. Open **Riff Room**. Every link you paste is saved on this Mac and shows up in **Songs** (title, uploader, a still from the clip, BPM, key, date added). Click a song to load it with the loop points, speed, downbeat nudge, and alphaTex you last saved. Rename and delete are on the card. Search and sort sit above the list.
2. yt-dlp downloads it logged out. ffmpeg transcodes to H.264/AAC (`yuv420p`, `+faststart`) so Safari can play it. The riff is saved under `riffs-library/` (gitignored): title, uploader, source URL, duration, BPM, key, notes, and the tab.

### Song queue

Links Kyle sends in chat, instead of pasting them into the app, go in `riffs.json` at the repo root. The assistant appends an entry and pushes. On startup, and when you press **Sync**, the helper reads that queue and downloads any link that is not already in the local library.

It tries the public file on `main` first:

`https://raw.githubusercontent.com/KG1610/Guitar-Practice-/main/riffs.json`

If that request fails (the file is not on `main` yet, or the machine is offline), it uses the `riffs.json` checked out next to the app. Progress shows as `1 of 3 — title`. A link that resolves to a video already on disk is skipped, so edits are kept.

```json
{
  "riffs": [
    {
      "url": "https://www.facebook.com/share/r/1FZGC2nZgS/",
      "title": "Easy A Minor Guitar Solo 80 bpm",
      "notes": "Den Kondrashev practice reel with tabs",
      "added": "2026-10-28"
    }
  ]
}
```

`url` is required (Facebook, Instagram, or YouTube). `title`, `notes`, and `added` (`YYYY-MM-DD`) are optional. A bare array of those objects is accepted too. The queue currently starts with the A minor reel above.
3. The player loops the whole clip, an A–B section, or a range of bars (**Bars 3 to 4 → Loop bars**, worked out from the riff's BPM and downbeat). Speed is 25–100% with pitch preserved (`preservesPitch`). **Count-in** plays one bar of clicks on the riff's grid at the current speed, before the first pass or before every loop.

   **Speed builder:** set a start speed, a step, how many loops per step, and a target (default 50% → +5% every 4 loops → 100%). It raises the speed at the loop point. **Missed it — slow down** drops one step and restarts the count. The speed and the builder settings are saved with the riff, so the next session picks up where you stopped.

   The Songs list folds away once a riff is open; click **Songs** to get it back. Tempo, key and downbeat corrections sit under **Tempo, key and downbeat**.
4. The Tone.js kit plays a simple rock beat at the riff's BPM, scaled with the slowdown, on the same clock as the loop.
5. Tempo and key come from the audio, then get corrected. An onset detector often locks onto double-time (a busy lick can read ~160 when the title says 80). The yellow current-bar in the video is a second clock: if the highlight advances about once every 3 seconds, that is 80 BPM. A printed "80 bpm" or "A minor" in the title or description wins when it agrees with an audio harmonic or a relative key. Tap tempo, ÷2, ×2, the BPM field, the key menu, and the downbeat offset are always there.
6. **Tab image** is the scrolling Guitar Pro strip stitched into one picture, yellow wash removed. **Playable tab** is alphaTex rendered by alphaTab, horizontal like Songsterr, with a cursor that follows the video (and the slowdown). The alphaTex box is editable — apply it if a fret is wrong.

**Neck** jumps back to the fretboard in the detected scale.

### Parts: fade the guitar out

**Parts → Split guitar from drums** runs Demucs on this Mac (about 10 seconds for a 30-second reel on a recent laptop; it runs once per riff and the parts are saved in its folder as WAV). Then there are three faders, **Guitar**, **Drums** and **Bass**, and presets: **Full**, **Guitar 50%**, **No guitar**, **Drums only**. The mix is saved with the riff.

"Guitar" is everything that is not drums or bass. Demucs often files distorted lead guitar under "other", and these reels are guitar over drums, so the guitar fader takes all of it (keys or vocals would come along too).

The parts follow the video: slowdown keeps their pitch, loops and the count-in work the same, and drift is corrected by nudging each part's rate (they measure within a few milliseconds of the video). The video's own sound is muted while parts are loaded.

With the speed builder on, **then fade the guitar out** drops the guitar a quarter every N loops once you reach the target speed, until it is just you and the drums.

The **Practice kit** (the synth beat) is separate; switch it off if the real drums are enough.

### Theory

Under the tab, **Theory** reads the playable tab (through alphaTab's own parser, so pitches match what is drawn) and explains the lick in the riff's key:

- **The lick on the neck.** High e on top, like the tab. Root, chord tones (1, b3, 5 in minor), other scale notes and notes outside the scale each get a colour; the rest of the scale is drawn faintly behind. Labels switch between **Degrees** and **Notes**. **Follow bar** lights up the bar that is playing. Bend arrows mark bent notes.
- **Bar by bar.** The degrees of each bar (`4↗5` is a bend). Click a bar to loop it.
- **What it's made of.** The simplest scale that covers at least 90% of the notes (minor pentatonic before blues before natural minor, and so on), which pentatonic box it sits in, outside notes and what they are doing (passing, bent into the scale, or colour) and which scale they come from, the degrees it leans on, where it starts and lands, and what its bends do.
- **The scale card** with its formula in this key, and **Jam this scale on the Desk**, which sets the Desk fretboard to that scale, root and box.
- **Make it yours.** Exercises built from this lick: change the last note, play the same idea in the next box, add one new note (the step to the next scale), move the bend, answer the first bar with your own.

Change the key under **Tempo, key and downbeat** and the breakdown follows. If a fret is misread, fix it in the alphaTex box and press **Update tab**; the theory updates too. With no key saved, it guesses one from the notes and says so.

### Test clip — what the reader got right

Den Kondrashev, "Easy A Minor Guitar Solo 80 bpm for practise + tabs", Facebook reel `28739829985639091` (26.1 s, 1080×1920, the source is AV1; the library copy is H.264). Logged-out yt-dlp downloaded it.

- **Tempo.** Audio onset peak 80 BPM, with a strong second peak near 162 (the double-time reading). The yellow bar moves about every 3.0 s, which is also 80. The title says 80. The room shows 80.
- **Key.** The room shows **A minor**, from the title. Chroma on its own ranked G major, then C major, then E minor, then A minor — the usual "same notes, which tonic?" mix-up. The title breaks the tie. Change it in the menu if a later clip is actually the relative major.
- **Tab image.** Six stable views stitch into one strip covering all 10 bars, including the empty opening and the empty last bar. The on-screen frames sit underneath.
- **Frets that match the picture.** Bar 2: the 8-over-7 double-stops, then 7, 5, and the tied 5s. Bar 3: the 4s and the 5 on the string below, then 5–7. Bar 4: 14, 14, 12 and the tied 12s, with full bends on the second 14 and the 12. Bar 5: 12 then the 10s and 9s into the 7s and 5. Bar 6: the palm-mute run walking up the lower strings (5–8, 5–7, …). Bar 9: 8–7–5, 8–6–5, 7–5–4. A few of those frets are flagged low-confidence in the note under the tab.

### Test clip — what it got wrong

- **Rhythm inside the bar** is the weak part. Beam reading did not add up to a 4/4 bar on bars 3–7, so those bars were retimed from how far apart the numbers sit. Guitar Pro stretches spacing around bends, so some of those values are 16ths or mixed tuplets when the ink is really straight 8ths or triplet 8ths. Bar lines follow the yellow highlight; the cursor will drift inside a bar. Fix it in the alphaTex box.
- **Bends.** Full bends on the 14 and 12 are there. The half-step bends in bar 3 and the 1½ bend were not separated reliably — several are either missing or drawn as a full bend up, not a bend-and-release (that graph crashes this alphaTab build, so the tex uses a plain bend).
- **Slides, hammers, vibrato.** The 12\\10 and 10\\9 slides in bar 5 are mostly just the fret numbers, without the slide. A couple of pull-offs in bar 8 were marked as slides. The "H" / "P" letters and the vibrato waves were not read. Palm-mute is on the right run and spills a little into the next bar.
- **Downbeat.** The highlight grid landed about 0.4 s after t = 0, so the saved offset is around −2.6 s (bar 1 of the score starts before the reel). If the click feels late, nudge **Downbeat**.

The stitched image is the thing to trust while you correct the playable tab. Nothing from the reel is committed; `riffs-library/` stays on the machine.

## Desk features

- **Multi-bar forms** — patterns can define a `form` array of 4–8 bars; the player advances bar-by-bar then loops the whole form. Grid + playhead follow the current bar.
- **Chorus lift / verse chug** — original multi-bar metalcore practice beds (inspired energy, not transcriptions).
- **8-bar jam beds** — clear 16ths / 8ths / quarters, a tasty change around bar 5, and a bar-8 fill. Original practice patterns (not transcriptions).
- **Session memory** — restores pattern, BPM, mix, volume, count-in, ramp, riff lock, and fretboard/drill choices from `localStorage` key `practice-desk-v1`.
- **Riff lock** — optional dark muted pulse under kick hits (Tone.js DuoSynth) so you can lock a chug feel without a full guitar sim.
- **Neck drills** — Off | Roots on 1 | Color on snare | Ascend with click.
- **Rhythm geometry** — polar view of the current bar: 4-beat diamond, kick polygon, snare, hats, moving playhead. 12-step grooves use eighth-note triplets (`8t`).
- **Form composer** — click-add / drag-drop bars into a 4–8 slot strip, play the assembled form, save named customs under **My forms** (`practice-desk-customs-v1`).
- **Favourites** — star presets or My forms; they pin under **Favourites** (`practice-desk-favs-v1`).


## Composer

Assemble a 4- or 8-bar form from existing bars, then play or save it.

1. Open the **Composer** panel (under the stage playhead).
2. Toggle **4 bars** / **8 bars**.
3. **Add current bar** copies the loaded pattern’s current bar into the next empty slot — or drag a pattern chip onto a slot.
4. Reorder by dragging filled slots; clear a slot with **×**.
5. **Play form** loads a synthetic multi-bar pattern into the player.
6. **Save as…** stores a named form in `localStorage` key `practice-desk-customs-v1`. Saved forms appear under **My forms** in the chip list (load / play / delete).

Out of scope for v1: per-hit grid editing inside a custom bar.

## Copyright / inspiration

Feels are **original practice patterns**. Names like “Chorus lift · metalcore” or “Jam bed · tasty simple” describe vibe only. They are **not** transcriptions of any song (including Forsaken / AILD / Provoke the Truth). Do not paste Songsterr tabs, lyrics, or audio into this repo.

## Default take

Pick **Clear 16ths · lock** or **Chorus lift · metalcore**, kit + click, grid visible. Hit Play.

## Feels

| Groove | Subtitle |
|---|---|
| Chorus lift · metalcore | Inspired practice feel — not a transcription |
| Verse chug · 4-bar | Palm-mute groove with bar-4 twist |
| Clear 16ths · lock | Jam bed · clear 16ths |
| Clear 8ths · breathe | Jam bed · clear 8ths |
| Pocket quarters · pulse | Jam bed · big pulse |
| Jam bed · tasty simple | Provoke-the-Truth energy — original |
| Four + change · AB | Jam bed · crystal AB |
| Metal drive · 8 | Inspired metalcore feel — not a transcription |
| 16th chug | AILD / metalcore |
| Breakdown | AILD / metalcore |
| Gallop | Metal / 1-e-a |
| Triplet pulse | Geometry · 3 per quarter |
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

Default **A harmonic minor**. Switch natural / harmonic / melodic minor, pentatonic, Phrygian, Dorian, major. Teal = root, amber = color tone (the 7 in harmonic minor).

Suggested patterns: all notes, five boxes, 3 notes per string. Notes outside the selected pattern stay dim so you still see the whole neck.

Neck drills pulse matching notes from drum events while the kit/click runs.

## Stack

Vite + Tone.js synth kit. No sample licenses. Tests: `npm test` (front end, Vitest) and `python3 -m pytest server/tests` (helper). Tempo runs 30–250 BPM. Open the app with `?debug` to show the debug panel.

## Code layout

```
index.html          page shell
src/main.js         boots the Desk and the Riff Room
src/desk/           drum desk: transport (app.js), step engine, forms, composer, presets, geometry, session
src/audio/kit.js    the Tone.js kit shared by both views
src/theory/         fretboard and scales
src/riff/           Riff Room: player, drum sync, playable tab, key → fretboard
src/styles/         CSS
patterns/           drum pattern JSON
server/             local Python helper (download, analysis, tab reading)
```
