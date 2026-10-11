# MPC 1000 — Browser Edition

A 16-pad MPC1000-style sampler and pattern step sequencer that runs entirely in the browser.

```bash
bun install
bun run dev      # http://localhost:5173
bun run build    # typecheck + production build
```

## Audio engine

Custom Web Audio engine (`src/audio/`) — no Howler / WAM. It needs things Howler can't do:
sample-accurate lookahead scheduling, per-voice filters/envelopes, choke groups, and an offline
renderer that reuses the exact live voice chain for WAV export.

- **Scheduler** — worker-timed lookahead clock (`transport.ts`), swing, live record with quantize
- **Voices** — `voice-pool.ts`: region start/end, tune/fine, reverse, loop, one-shot / note-on,
  mono/poly, mute groups, attack/decay, LP/HP/BP filter, retrigger rolls, delay + reverb sends
- **Mix bus** — tempo-synced delay, convolution reverb, bus compressor (`mix-chain.ts`)
- **Sampling** — mic/line-in via AudioWorklet with auto silence trim (`sampler.ts`)

## The machine

| Control | What it does |
|---|---|
| Pads | 4 banks × 16. Velocity from hit height. Drop audio files on a pad to load it |
| MODE + pad | Screen select (labels above pads): TRIM, PROGRAM, MIXER, EFFECT, RECORD, LOAD, SAVE, SONG, SEQ EDIT, MIDI, OTHER, SLIDER |
| F1–F6 | Soft keys for the current screen |
| DATA wheel / cursor | Edit the highlighted field (also mouse wheel or drag on a field) |
| WINDOW | Enlarge the screen for detailed editing |
| TAP TEMPO | Tap tempo; hold = note repeat; SHIFT+TAP latches repeat |
| ERASE | Hold + pad: wipes that pad's events (live while playing, whole track when stopped) |
| FULL LEVEL / 16 LEVELS | Max velocity / spread the selected pad over 16 velocities or pitches |
| TRACK MUTE | Pads toggle track mutes (SHIFT = solo) |
| REC / OVERDUB | REC overwrites on the first pass then drops into overdub; OVERDUB layers |
| Q1 / Q2 | Sliders mapped to a parameter of the selected pad (AFTER cycles target) |

**Pad editing** — TRIM (start/end with draggable waveform markers, zoom, normalize, crop, chop
into slices by equal division or transient detection), PROGRAM (level, tune, fine, attack, decay,
velocity sensitivity, pan, filter, play mode, polyphony, loop, mute group, reverse, retrigger).

**Sequencer** — 16 patterns, 8–64 steps, 1/8 · 1/16 · 1/16T · 1/32 resolution, swing, paint-drag
editing, right-click velocity cycling, per-pad velocity lane, mute/solo, copy/double/clear/undo,
song-mode chaining, WAV bounce.

**Keyboard** — `Z X C V / A S D F / Q W E R / 1 2 3 4` = pads 1–16 (Shift = accent), Space =
play/stop, arrows = cursor, `,` `.` = decrement / increment field. Web MIDI notes 37–52 play the pads.

Projects autosave to IndexedDB; SAVE → EXPORT writes a portable `.mpcweb` file with samples.
