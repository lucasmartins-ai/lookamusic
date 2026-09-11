# LookaMusic — Architecture Document (Phase 0)

Status: normative for Phases 1–15. Changes require a TDR (§59).

## 1. Product statement

Browser-based real-time instrument: **VOICE → MUSIC**, secondary **GESTURES → ARRANGEMENT**.
"You sing the song. LookaMusic builds the band."

## 2. Principles (from spec §2)

1. **Real-time first.** Critical audio path stays local. No per-frame server round-trips.
2. **Deterministic foundation.** DSP + theory + rules first; ML only with measurable advantage; LLM never on the hot path.
3. **Graceful uncertainty.** `RAW AUDIO → DETECTED PITCH → STABLE NOTE → MUSICAL EVENT`, each with confidence.
4. **Musicality over purity.** Prefer the most coherent interpretation when ambiguous.
5. **Progressive complexity.** RULES → +PROBABILISTIC → +STATISTICAL → +ML (justified only).

## 3. Layered architecture

```
┌────────────────────────────────────────────┐
│ UI (React, App Router)                     │  renders summaries, never raw samples
├────────────────────────────────────────────┤
│ Application layer (hooks, conductors,      │  session lifecycle, scheduling, mapping
│ session controller, schedulers)            │
├────────────────────────────────────────────┤
│ Domain layer (pure TS, NO React/WebAudio)  │  theory, engines, state, events, config
├────────────────────────────────────────────┤
│ Infrastructure (AudioWorklet, Workers,     │  mic, DSP, persistence, export, vision
│ MediaDevices, IndexedDB, MediaRecorder)    │
└────────────────────────────────────────────┘
```

**Boundaries (§53, enforced by import rules + review):**

- `domain/` imports nothing from `features/audio`, `features/gestures`, React, or Web Audio.
- Theory (`music/theory`) imports nothing from Web Audio.
- Pitch detection imports nothing from UI.
- Gesture recognition never calls instrument engines; it emits `GestureEvent` → Arrangement Engine.
- Conductor orchestrates; engines own their logic.
- Audio representation is never the source of truth; `MusicalState` / event graph is.

## 4. Runtime pipeline (client-side hot path)

```
MIC → getUserMedia → AudioContext → AudioWorklet(DSP+pitch)
  → postMessage(PitchObservation @ ~30–60Hz, not per-sample)
  → [main thread or Worker] smoothing → stabilization → NoteEvents
  → MusicalState → engines (key/harmony/rhythm/arrangement)
  → Music Event Graph → InstrumentEngines → Synthesis → Master → speakers
CAMERA → hand landmarks → GestureRecognition → GestureEvent → ArrangementEngine
```

- Worklet does DSP + pitch only; posts compact observations.
- React receives throttled summaries (~10–15 Hz for meters, event-driven for notes).
- Look-ahead scheduler (~100–150 ms, tuned in Phase 8) renders instrument events.
- Heavy theory (key re-estimate, harmony re-score) runs on phrase boundaries or in a Worker, never per audio frame.

## 5. Modules & responsibilities

| Module | Owns | Emits / consumes |
|---|---|---|
| `features/pitch` | `PitchDetector` iface, YIN + autocorr impls, conversions, benchmark | `PitchObservation` |
| `features/audio` | mic session, AudioContext, Worklet node, diagnostics | observations → smoothing |
| `music/melody` | smoothing, hysteresis, stabilization, onsets, phrases | `NoteEvent`, `PhraseStarted/Ended` |
| `music/theory` | pitch-class, intervals, scales, keys, chords, functions | pure queries + `KeyUpdated` (gated: top change or Δconf > `updateDelta`) |
| `music/harmony` | candidates, scoring, progressions, voice leading, cadence | `ChordChanged` |
| `music/rhythm` | tempo tracking (est/target/playback), meter, drum patterns | `TempoUpdated`, `MeterChanged` |
| `music/arrangement` | active instruments, energy, transitions on bar/phrase boundaries | `InstrumentAdded/Removed`, `EnergyChanged` |
| `features/instruments` | `InstrumentEngine` iface + 9 instruments (Phase 6 + violão hotfix) | renders event graph |
| `features/gestures` | landmarks → gestures w/ confidence + hysteresis (Phase 9: recognition, static/swipe classifiers, camera session, mapping, hook) | `GestureDetected` (sole producer; conductor → arrangement only) |
| `features/recording` | structured session capture + replay (Phase 11) | `RecordingStarted/Stopped` |
| `features/editor` | operates on `MusicalState`, never raw audio (Phase 11) | state mutations |
| `features/export` | WAV/WebM/MIDI/JSON, later MP3/stems/MusicXML (Phase 12) | files |
| `domain` | types, events, config, `MusicalState`, styles | shared |
| `lib` | event bus, ids, time, storage adapters | shared |

## 6. Data flow hierarchy (§56)

```
VOICE → MELODY → MUSICAL CONTEXT → HARMONY → RHYTHM → ARRANGEMENT → INSTRUMENTATION → AUDIO
```

No engine skips levels (e.g. drums read tempo/onsets/energy, never raw pitch).

## 7. State & truth

- `MusicalState` (see `domain-model.md`) is the single source of truth for melody/chords/rhythm/arrangement/dynamics.
- Audio output is a rendering of the event graph. Re-rendering the same state must reproduce the same arrangement decisions (modulo wall-clock).
- Persistence stores structured composition; audio stems are derived artifacts.

## 8. Style system (§55)

Styles are data (`domain/styles.ts`), never engine branches:

```ts
interface MusicalStyle {
  id: string; bpmRange: [number, number];
  harmonicDensity: "sparse" | "medium" | "dense";
  drums: string; bass: string; piano: string;
  guitar: string; strings: string; dynamics: string;
  defaults: Partial<ArrangementState>;
}
```

Phase 1 ships 1 style slot (`neutral`); full preset list lands in Phase 7
(`src/features/music/arrangement/presets.ts`: neutral + ballad/rock/folk/
ambient, `ENERGY_ENSEMBLE`/`ENERGY_DENSITY`, runtime `registerStyle`).

## 9. Offline-first & privacy (§42, §46)

- Phases 1–12 fully local; no account, no audio upload.
- Mic/camera permission rationale shown before request; denial → guided recovery, never silent failure.
- Raw mic audio never leaves device unless user opts into a future cloud feature.
- Camera (Phase 9): video-only stream, frames classified in memory on-device, never recorded/uploaded/persisted; model (MediaPipe) loads lazily at runtime; denial/absence keeps full button + keyboard parity (§44).
- `PRIVACY.md` (to be added Phase 10) documents retention/deletion.

## 10. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Pitch noise → flicker | confidence gate + smoothing + hysteresis + min-duration (§9) |
| Tempo jumps | est/target/playback split + slew limiter (§21) |
| Key lock-in too early | rolling window + revisable estimate (§12) |
| UI jank from audio | Worklet isolation, throttled UI, no setState per sample (§45) |
| Gesture misfires | confidence + hysteresis + UI equivalents (§28, §44) |
| Long-session drift | Phase 14 soak tests 5/15/30/60 min; ring buffers, no unbounded arrays on hot path |

## 11. Conductor (Phase 8, §32)

`src/features/conductor/` owns the single bar/beat clock; engines own all
musical decisions (§40: orchestration only, never engine logic):

- `transport.ts` — `MusicalTransport`: origin + playback BPM + meter;
  `barFloatAt/beatFloatAt/barStartSec/nextBoundary`. Audio-clock driven.
- `state.ts` — `ConductorState`: central `MusicalState` from domain events
  (notes/chords/tempo/meter/key/lineup/energy/phrases), rings capped at
  `config.conductor` (soak-safe).
- `harmony-driver.ts` — one chord per bar reusing the Phase 4 scorer
  (diatonic pool + 6 dimensions + template prior + repeat cap).
- `conductor.ts` — `Conductor`: input path (melody → rhythm → key),
  bar planning (`planAheadBars` 2), quantized arrangement drains, mixer,
  manual pins (`pinHoldsAuto`: pins survive Auto), hot drum pickup
  (first onset per bar → remaining groove at now + 50 ms, drums only),
  latency + degradation. No React, no AudioContext import.
- `latency.ts` / `degradation.ts` — measured voice→band budget (250 ms) +
  graceful full → reduced → minimal (never silence).
- `useConductor.ts` + `/session` — transport tick 50 ms, fixture injection
  (`?fixture=g4`, no-mic E2E path).

Decisions: TDR-08 (hot pickup, 25 ms scheduler grace, 120/25 ms confirmed).

Phase 9 adds the gesture path: `Conductor` subscribes `GestureDetected`
→ `applyGesture` (open/close on a cyclic selection, fingers/step →
energy, all through the quantized arrangement controls; malformed
payloads ignored). Decisions: TDR-09 (mapping, per-gesture cooldown,
optional MediaPipe loader, keyboard parity).

## 12. Export Engine (Phase 12, §40)

`src/features/export/` owns offline export pipelines, 100% decoupled from the live playback engine:

- `json.ts` — `ExportedCompositionV1`: versioned JSON envelope (`schemaVersion: 1`, generator, timestamp, strict validation). Migrates unversioned payloads and rejects corrupt/future schemas with legible errors.
- `midi.ts` — Standard MIDI File (SMF 1.0) Format 1 multitrack encoder and parser in pure TypeScript (zero dependencies). Track 0: Conductor (Tempo, Meter). Track 1: Melody (tick-quantized PPQ 480). Track 2: Chords (harmonic voicings). Validated note-by-note.
- `wav.ts` — Offline audio synthesis via `OfflineAudioContext` + canonical 16-bit PCM stereo RIFF WAVE encoder (`encodeWav` at 44.1 kHz). Duration computed from melody/chords bounds with 1.0s decay tail.
- `webm.ts` — Compressed Opus export via `MediaRecorder` with compatibility detection (`isWebmExportSupported`) and graceful fallback.
- `ExportModal.tsx` — Accessible UI modal on `/compose/[id]` with format selection (WAV/MIDI/JSON/WebM), progress indicator, and instant browser download.

Decisions: TDR-12 (MP3 deferred to Phase 14/15, Stems delivered in MIDI / WAV zip for Phase 14, MusicXML deferred to Phase 13 notation engine).

## 13. Educational Engine (Phase 13, §47)

`src/features/learn/` owns computational music theory pedagogy, converting mathematical representations into human-accessible Portuguese descriptions without any LLM:

- `explain.ts` — pure TypeScript pedagogical engine:
  - Canonical triad identification (e.g. `C–E–G` → `"tríade de C maior"`).
  - Roman numeral harmonic function analysis (e.g. `G–D–Em–C` in G → `"funções I–V–vi–IV em G"`).
  - Four canonical cadences: Authentic (V→I), Plagal (IV→I), Deceptive (V→vi), Half (→V).
  - Voice leading analysis (`explainVoiceLeading`) and modulation tracking (`explainModulation`).
  - Graceful fallbacks for atonal, partial, or transitioning figures.
- `types.ts` & `useLearnSettings.ts` — 9 progressive learning levels (`beginner` to `advanced`), global toggle with zero UI/runtime weight when deactivated, `localStorage` persistence.
- `/learn` Studio + `LearnPanel.tsx` — interactive theoretical laboratory and real-time contextual panel in `/session`.

## 14. Quality, Reliability & Hardening (Phase 14, §45)

Strict production-grade reliability safeguards guaranteeing stationary memory growth and zero audio dropouts:

- **Bounded Ring Buffers**: All event collectors (`NoteStabilizer`, `PhraseTracker`, `KeyEstimator`, `ConductorState`, `LookaheadScheduler`) enforce strict capacity ceilings (`melodyCap: 128`, `phraseCap: 64`, `pending: 64`, `schedulerQueue: 512`), preventing unbounded memory growth in long sessions.
- **Three-Tier Graceful Degradation**: Monitored by `DegradationController` based on scheduler tick duration and late frames:
  1. *Full*: 100% engines active, 60Hz worklet proxy, 12Hz UI meters;
  2. *Reduced* (`"QUALIDADE REDUZIDA"`): Decimates observations, halves UI meter frequency, computes theory every 2 bars;
  3. *Minimal* (`"MODO LEVE"`): Suppresses heavy harmonic layers, guaranteeing synchronous drums + bass. Never silence.
  - Hysteresis recovery ensures clean recovery without flapping.
- **Lifecycle Cleanup & Teardown**: `Conductor.dispose()` and `useConductor` teardown explicitly unsubscribe event listeners, cancel pending audio timers, and close Web Audio contexts on unmount.

## 15. Portfolio Release Architecture (Phase 15, §50)

Unified system presentation and multi-surface routing:
- `/` — Instrument Landing Page: Onboarding guide, audio-health advisories, quickstart, voice melody timeline, and portfolio module directory.
- `/session` — Live Conductor: Real-time voice-to-band orchestration, hot drum pickup, 8-instrument lineup, camera gesture conducting, live educational mode, and structured session recorder.
- `/compose` — Studio Hub: Saved local projects catalog with metadata.
- `/compose/[id]` — Timeline Editor: Multitrack interactive piano roll, 1/16 quantization, harmonic regenerator, and offline export modal (Standard MIDI 1.0, 16-bit stereo WAV, versioned JSON v1, WebM/Opus).
- `/learn` — Theory Lab: Interactive computational music theory laboratory and progressive curriculum.
- Fully offline, 100% on-device execution, zero cloud dependency, zero external audio sample copyright constraints (100% synthesized procedurally via `WebAudioSink`).

## 16. Sample Instruments with Procedural Fallback (Phase 16, TDR-16)

Piano → violão → bateria render real samples; the procedural `WebAudioSink`
stays the automatic, invisible fallback (no packs, offline, fetch/decode
failure, instrument without pack):

- `features/instruments/packs/*.ts` — pack manifests as DATA
  (`packId`, version, license, attribution, remote https `baseUrl`, note/voice
  URL lists). Engines never contain URLs; they reference the packId only.
- `sample-cache.ts` — `SampleCache`: pure nearest-sample mapping (nearest
  MIDI wins, `playbackRate = 2^(st/12)` within ±`maxDetuneSt`, else synth) +
  `fetch` → `decodeAudioData` → `AudioBuffer` into memory + Cache API
  (PWA offline-first, versioned keys migrate). `fetch`/`decode` injectable —
  vitest runs with fakes, zero real network. Downloads run ONLY on user
  action (`useSamplePacks` "Baixar som real" button), never silently.
- `sample-voice.ts` — `SampleVoice implements VoiceSink` beside
  `WebAudioSink`: pitched notes via `AudioBufferSourceNode` + existing
  release envelope; drums hold the membrane `tone` and play ONE one-shot on
  the paired `noise` (reverse lookup in `config.instruments.drumVoices`, no
  double-trigger; without a sample the original pair re-emits bit-identical).
  Every miss delegates to the inner synth — no click, no exception, no
  silence. `createInstrumentSink(ctx, master, id, cache)` wires
  `config.instruments.samples.<id>.useSamples` + cache availability; the live
  real/synth toggle is a per-note in-memory flag (instant, no graph rebuild).
- `sample-store.ts` + `useSamplePacks.ts` — all business logic (prefs in
  `localStorage`, progress, offline state); `SamplePackPanel` /
  `SampleCredits` only render. SSR-first mount sync (no hydration mismatch).
- Packs ship OUTSIDE web + Tauri bundles (runtime download only); guitar
  keeps synthesis (no license-clean pack). Offline export (`renderToWav`)
  stays 100% synth (deterministic) — samples in export is explicit future work.


