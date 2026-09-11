# Repository structure (§52) — actual

```
src/
  app/                    Next.js App Router (layout, page, globals.css, session/ Ph8+, compose/ and compose/[id]/ Ph11 OK)
  components/             React UI: PitchCanvas, NoteTimeline, DiagnosticsPanel, BandPanel (Ph6+), ArrangementPanel (Ph7+), GesturePanel (Ph9+), OnboardingGuide + StatusCard + HelpDialog (Ph10+), TimelineEditor (Ph11 OK)
  features/
    audio/                mic session, AudioContext mgr, worklet node, diagnostics sampler
    pitch/                PitchDetector iface, autocorr + YIN impls, conversions, benchmark
    music/theory/         pitch-class, intervals, scales, keys, chords (pure)
    music/melody/         smoothing, stabilization, onsets, phrases (Ph2+)
    music/harmony/        candidates, scoring, progressions, voice leading (Ph4+)
    music/rhythm/         tempo tracking, meter, patterns (Ph5+)
    music/arrangement/    state, dynamics, presets + useArrangement (Ph7 OK)
    conductor/            transport, state, harmony-driver, conductor, latency, degradation, fixture + useConductor (Ph8 OK)
    instruments/          InstrumentEngine iface + 9 instruments + scheduler/mixer (Ph6 OK, scheduler grace Ph8)
    gestures/             recognition (hold/cooldown/hysteresis) + landmarks (static/swipe/MediaPipe loader) + camera + mapping + useGestures (Ph9 OK)
    recording/            schema validation, IndexedDB storage, session capture, timeline editor, bit-identical replay + useRecorder (Ph11 OK)
    export/               (Ph12)
  domain/                 types, events, styles (pure)
  lib/                    config (all tunables), event bus, ids, time
  workers/                theory/heavy compute off-main-thread (Ph3+)
  audio-worklets/         pitch-processor.js (DSP, no npm deps)
tests/unit/               vitest: conversions, detectors, theory, stabilization… + conductor-* (Ph8)
tests/e2e (e2e/)            playwright: session start→fixture→band→toggles, no mic (Ph8+)
tests/fixtures/           synthetic tones (generated), human recordings (opt-in, licensed)
docs/                     normative specs; docs/tdr/ decisions
public/                   static assets, sample metadata (no copyrighted samples)
```

Rule: business logic never accumulates in `components/`; components render + dispatch.
