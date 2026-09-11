# Music-theory engine spec (§13–15, §17) — Phase 3

Pure functions over domain types. No I/O, no randomness outside seeded scoring.

## 13. Scales

- Registry: major, natural/harmonic/melodic minor (intervals arrays in `theory/scales.ts`).
- Future modes (dorian…locrian) = data rows; API (`scaleContains`, `nearestScaleTone`, `quantizeToScale`) unchanged.
- Membership tests operate on pitch-class sets; expose `getScalePcs(root, scaleId)`.

## 14. Intervals

- `semitonesToInterval(n)`: 0 unison … 12 octave; compound = octave + simple (name + short, e.g. M3).
- Enharmonic spelling deferred to Phase 13 (education); engine uses semitone + pitch-class math.

## Key detection (§12)

- Rolling window (default 8 s, `KEY_WINDOW_MS`), weighted by duration × confidence × recency.
- Pitch-class histogram → Krumhansl-style correlation against major/minor profiles → ranked candidates with confidence.
- Never lock on first note; revise as evidence arrives; emit `KeyUpdated` only when top key changes or confidence Δ > 0.15.
- Chord evidence (Phase 4+) feeds back as bonus weight, not override.

## 15. Chords

- `Chord = { root: PitchClass, quality, extensions?, inversion? }`.
- Qualities: major, minor, diminished, augmented, dom7, maj7, min7, sus2, sus4 (extensible union).
- `chordTones(chord) → pcs`, `chordFromPcs` for analysis, `chordName` for display ("Em7", "Csus4").
- Harmonic function `getFunction(chord, key) → TONIC | SUBDOMINANT | DOMINANT | UNKNOWN` (major degrees I–vii°; minor: i, iv, V/VII functional set).

## Acceptance (Phase 3)

Unit tests: interval names, scale membership, chord tones, function mapping, key estimate on
C–E–G corpus → C major conf > 0.6; G–D–Em–C phrase → G major family. No audio required.
