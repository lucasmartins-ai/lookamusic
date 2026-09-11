# LookaMusic — Event Model (§33)

Strongly typed domain events on a minimal typed bus (`src/lib/events.ts`).
Modules subscribe to events, never to each other's internals. Conductor coordinates.

## Event catalog

| Event | Payload | Producer → Consumers |
|---|---|---|
| `PitchDetected` | `PitchObservation` | pitch → smoothing/UI meters (throttled) |
| `NoteStarted` | `NoteEvent` (partial) | stabilizer → timeline, melody |
| `NoteChanged` | `{ id, midi, confidence }` | stabilizer → timeline |
| `NoteEnded` | `{ id, duration }` | stabilizer → melody, phrases |
| `TempoUpdated` | `TempoState` | rhythm → conductor, UI, drums |
| `MeterChanged` | `TimeSignature` | rhythm → UI, drums, conductor |
| `KeyUpdated` | `KeyEstimate` | key engine → harmony, UI, education |
| `ChordChanged` | `ChordEvent` | harmony → instruments, UI, education |
| `InstrumentAdded/Removed` | `{ instrument: InstrumentId }` | arrangement/gesture/UI → instruments |
| `EnergyChanged` | `{ energy: number }` | dynamics → arrangement, UI |
| `GestureDetected` | `GestureEvent` | vision/hook → conductor → arrangement only (Phase 9: buttons/keyboard emit the same event as vision) |
| `PhraseStarted/Ended` | `{ id, startTime [, endTime] }` | melody → harmony/arrangement/transitions |
| `RecordingStarted/Stopped` | `{ sessionId [, reason] }` | recording → UI, storage |

## Rules

1. Event names are `PascalCase` verbs; payloads are interfaces in `src/domain/events.ts`.
2. Audio-frame-rate data (`PitchDetected`) never drives React state directly — UI subscribes via a throttled store (~12 Hz).
3. `GestureDetected` may only mutate arrangement; vision → synthesis coupling is a boundary violation.
4. Every event is loggable by the diagnostics panel; in dev, bus supports a ring-buffer trace (cap 500).
5. Persistence/export consume state + event log, never live audio nodes.
