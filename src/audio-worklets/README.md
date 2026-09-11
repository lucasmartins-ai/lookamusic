# audio-worklets

Canonical DSP sources live here per `docs/repository-structure.md`.

Runtime constraint: `AudioWorklet.addModule()` requires a same-origin URL,
so the built file is served from `public/worklets/pitch-processor.js`.
That file is the canonical implementation; this directory documents the
contract. If the worklet ever needs npm imports, move to a bundled worker
build and update `features/audio/session.ts` + `docs/audio-processing-strategy.md`
via a TDR.

Parity: `tests/unit/pitch-detectors.test.ts` asserts the TS
`AutocorrelationDetector` against the same corpus the worklet mirrors.
