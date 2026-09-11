# TDR-09 — Gesture mapping + recognition semantics (Phase 9)

Date: 2026-09-10. Status: accepted.

## Context

TDR-07 defers the gesture stack to Phase 9 with MediaPipe Tasks Vision as
the landmark candidate and mandatory UI parity. The architecture
(`docs/gesture-architecture.md`) fixes the pipeline, the vocabulary, and
the anti-misfire constants (0.7 / 400 ms / 1200 ms) but leaves open: how
poses become events, how swipes fit a hold-based gate, what each gesture
does, and how the model loads without breaking the build.

## Decision

1. **Recognition is pure math in `features/gestures/recognition.ts`.**
   Static poses need the full 0.7 confidence to ENTER a hold, tolerate
   dips to 0.6 (hysteresis margin, `config.gesture.hysteresisMargin`)
   while held, and fire after 400 ms. Tracking loss decays — never
   latches. Cooldown (1200 ms) is PER-GESTURE: OPEN→CLOSED stays fast,
   OPEN→OPEN can't double-fire.
2. **Swipes bypass the hold** via `pushDiscrete` (threshold + shared
   cooldown). Their gate is the motion window itself (≥ 0.25 frame
   travel inside 600 ms, `SwipeDetector`); slow drift never fires.
3. **Mapping is data + total functions** (`mapping.ts`): open/close act
   on a cyclic instrument selection (default guitar — the trio plays by
   default, guitar is the natural first add); fingers 1/2/3 set explicit
   energy levels; vertical swipes step energy; horizontal swipes move the
   selection. The conductor owns the selection and applies gestures
   through the SAME quantized `requestInstrument` / `setEnergyMode` as
   manual controls (gesture adds pin, like manual toggles).
4. **MediaPipe loads optionally at runtime** (`landmarks.ts`): indirect
   dynamic import with `webpackIgnore`, GPU delegate, local inference.
   Null when unavailable (SSR/tests/package missing) → preview-only +
   full button/keyboard parity. No stack change, so no TDR-07 revision —
   this record covers the integration semantics.
5. **Keyboard map is normative** (`GESTURE_KEYBOARD`): O/C, 1/2/3,
   arrows. Vision, buttons, and keyboard emit the SAME `GestureDetected`
   event; the conductor can't tell them apart (parity by construction).

## Consequences

- Boundary `gestures → instruments` is enforced by a unit test that
  scans the module sources (import specifiers + audio/upload globals).
- Malformed bus payloads are ignored (`isGestureKind` guard in
  `Conductor.applyGesture`) — the lineup can't be crashed from the bus.
- A dedicated vision Worker is DEFERRED (see risk 1 in the Phase 9
  changelog entry): classification runs in rAF, off-DOM, with no
  per-frame React state. Phase 14 re-evaluates with CPU numbers.
