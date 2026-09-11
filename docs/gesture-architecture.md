# Gesture architecture (§27–28) — Phase 9 (IMPLEMENTED, TDR-07 + TDR-09)

```
Camera → getUserMedia(video) → hand-landmark model (MediaPipe Tasks Vision, local)
  → GestureRecognition (confidence + hysteresis + cooldown)
  → GestureEvent → ArrangementEngine → bar/phrase-boundary transitions
```

Implemented in `src/features/gestures/` (see `repository-structure.md`):
`recognition.ts` (hold/cooldown/hysteresis/decay) ← `landmarks.ts`
(static classifier + swipe gate + optional MediaPipe loader) ←
`camera.ts` (permission + preview lifecycle); `mapping.ts` (vocabulary →
intent + keyboard map + selection); `useGestures.ts` (hook: vision loop,
buttons, keyboard → ONE `GestureDetected` event). Consumed by the
conductor (`Conductor.applyGesture` → quantized arrangement, TDR-09).

## Vocabulary (v1)

- OPEN_HAND → add selected instrument; CLOSED_HAND → remove.
- ONE/TWO/THREE_FINGERS → action slots 1/2/3 (selectable target).
- SWIPE_UP/DOWN → energy ±; SWIPE_LEFT/RIGHT → selection/transition.

Concrete mapping (normative, TDR-09): fingers 1/2/3 = energy
low/medium/high (same as the Suave/Média/Cheia buttons); vertical
swipes step energy relatively (same as Energia ±); horizontal swipes
cycle the open/close target through the canonical instrument order
(default: guitar). Keyboard: O/C, 1/2/3, arrows (`GESTURE_KEYBOARD`).

## Anti-misfire (normative)

- Per-gesture confidence ≥ `GESTURE_CONFIDENCE_THRESHOLD` (0.7) for ≥ `GESTURE_HOLD_MS` (400 ms),
  then cooldown `GESTURE_COOLDOWN_MS` (1200 ms). Lost tracking → decay, never latch.
- Every gesture action has a button + keyboard equivalent (§44). Camera is enhancement, never sole path.
- Vision runs in Worker/off-DOM; posts `GestureEvent` only; direct vision→synth calls forbidden.

Implementation notes (measured, Phase 9):

- Hold entry needs the FULL threshold; while held, dips to 0.6
  (`hysteresisMargin` 0.1) are tolerated. Cooldown is per-gesture
  (OPEN→CLOSED stays fast). Swipes skip the hold (their motion window
  is the gate) but share threshold + cooldown. Malformed bus payloads
  are ignored, never crash the lineup.
- Off-DOM today = rAF loop, no per-frame React state (indicator polls
  at 8 Hz); dedicated Worker deferred to Phase 14 (TDR-09).
- MediaPipe loads lazily AFTER the preview flows and resolves null
  without it — build never depends on the model; denial/absence keeps
  full button + keyboard parity.

## Privacy

Camera frames never leave device, never recorded unless user records performance explicitly (and then only arrangement effects, not raw video, by default).
Permission rationale precedes request; denial → full UI parity path.
