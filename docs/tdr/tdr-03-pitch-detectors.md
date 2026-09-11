# TDR-03 — Two pitch detectors, benchmark picks default

Date: 2026-09-10. Status: accepted.

Context: spec §8 requires a replaceable `PitchDetector` and benchmarking ≥2 approaches on latency/accuracy/CPU/stability/vibrato/noise/speech/low-volume/registers.
Decision: ship autocorrelation (baseline) + YIN (accuracy candidate) behind the same iface; `tests/unit/pitch-benchmark.test.ts` generates the corpus in-code and reports the table. Default = winner on voice-like signals; recorded here once run.
Alternatives rejected: single-algorithm commitment (untestable claim), immediate ML (violates §2.5 progression; revisit per evidence).

## Result (2026-09-10, 2048-sample blocks @48 kHz, chromatic C4–C5 pure tones)

| detector | ms/block | RMSE cents | octave err % |
|---|---|---|---|
| autocorrelation (peak-picking) | 1.32 | 2.7 | 0 |
| yin | 1.38 | 2.1 | 0 |

Both inside the latency budget with equivalent accuracy on pure tones.
Two implementation bugs were found and fixed during benchmarking (documented
in code comments): global-argmax collapse to lag≈866 on C#4, and YIN's
incremental dip search reading uncomputed lags. Default for the live path:
autocorrelation inside the AudioWorklet (dependency-free, mirrors the TS
baseline); YIN remains the promotion candidate on voice-like corpus results
in Phase 2 (vibrato/speech/noise register behavior).
