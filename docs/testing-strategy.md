# Testing strategy (§48–49) — mandatory, Phase-gated

## Unit (vitest, CI-required from Phase 1)

freq↔midi, pitch→note name, intervals, scale membership, chord tones/compatibility,
harmonic scoring rank-order, voice-leading cost, tempo slew limiter, note stabilization
(hysteresis + min-duration incl. the G4-vibrato-G#4 fixture from §9), gesture debounce math,
arrangement transition guards.

## Integration (Phase 2+)

mic→pitch→note event (synthetic oscillator stream, no hardware in CI);
note events→harmony top-1 sane; state→schedule emits ordered audioTimes;
gesture→arrangement changes only on boundary.

## E2E (Phase 8+, Playwright, manual + recorded)

start → sing (fixture injection) → accompaniment → add/remove instruments →
record → replay → save → load → export. No mic hardware in CI; inject fixture buffers.

## Synthetic corpus (§49, generated in-code)

C4–C5 chromatic sines; vibrato/slide/silence/noise/speech-like FM; low-volume; register extremes.
Human fixtures only with documented consent/license, stored outside git (or LFS) — never required.

## Definition of done (§60) per feature

Implementation + tests + error handling + perf within budget + docs + coherent architecture
+ UI integrated + a11y considered + edge cases + acceptance criteria pass.
