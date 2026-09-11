# Pitch-detection benchmark strategy (§8)

## Interface under test

`PitchDetector.process(Float32Array, sampleRate): PitchObservation` — replaceable, pure, sync.

## Candidates

1. **Autocorrelation (baseline)** — simple, cheap, octave-prone. `src/features/pitch/autocorrelation.ts`
2. **YIN (default candidate)** — better accuracy/clarity at modest CPU. `src/features/pitch/yin.ts`
3. Future: McLeod Pitch Method, browser ML (e.g. CREPE-tiny/onnx) — only if benchmark shows measurable win (TDR-03).

## Corpus (`tests/fixtures/`, synthetic first per §49)

- Pure sines C4–C5 (chromatic), A4=440 reference.
- Vibrato (5.5 Hz, ±25 cents), slides (portamento 200 ms), octave jumps.
- Silence, white/pink noise, breath-like filtered noise, speech-like FM.
- Low-volume (−30 dBFS) and register extremes (E2, C6) for range behavior.
- Human recordings: opt-in only, documented license; never required for CI.

## Metrics (all reported, no cherry-picking)

Latency (mean/p95 per 2048-block), accuracy (cents RMSE, octave-error %, voiced/unvoiced F1),
CPU (ms/block on reference machine), stability (flicker count on steady tone),
vibrato/slide/noise/speech/low-volume behavior notes.

## Harness

`npm test -- pitch-benchmark` runs `tests/unit/pitch-benchmark.test.ts`:
generates corpus in-code (no binary fixtures in git), runs both detectors, prints table + asserts
minimum bars (e.g. YIN ≤ 50 cents RMSE on pure tones, octave-error < autocorr).
Default detector = benchmark winner; recorded in TDR-03 with numbers.

## Selection rule

Do not pick by popularity. Winner = best accuracy-per-CPU within latency budget on voice-like signals.
