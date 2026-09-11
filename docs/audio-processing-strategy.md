# Audio-processing strategy (§7) + Input-lag instrumentation (§26)

## Chain

`getUserMedia({audio: {echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`
→ `AudioContext({latencyHint:"interactive"})` → `MediaStreamSource` → `AudioWorkletNode(pitch-processor)`
→ `port.postMessage(PitchObservation)` at ≤60 Hz (every 2048-sample block @48k ≈ 43 ms; decimate UI to ~12 Hz).

- Raw `autoGainControl` OFF for honest energy; energy normalized + smoothed in domain layer (§31).
- Worklet does RMS gate → detector → message. No React, no DOM, no allocation on hot path (reuse buffers).
- `AudioContext.resume()` on user gesture (autoplay policy); suspended-state recovery UI required (§43).

## Latency budget (measurable, §26 — no "zero latency" claims)

| Stage | Target |
|---|---|
| Mic → Worklet block | ~20–45 ms (buffer size) |
| Pitch detect (YIN 2048) | < 5 ms main-blocking (worklet thread) |
| Message → stabilization → event | < 10 ms |
| Scheduler lookahead | 100–150 ms (stability, tuned Ph8) |
| **Perceived voice→accompaniment** | **< 250 ms typical** |

Diagnostics sampler records: avg/p95 pipeline latency, dropped frames, callback load %, glitch count.
Phase 1 displays them live; Phases 8/14 assert against the performance budget.

## Degradation

CPU overload → reduce posted rate (60→30 Hz) → reduce UI rate → show "reduced precision" badge.
Never silently drop to a broken silent state.
