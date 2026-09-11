# TDR-08 — Conductor answers inside 250 ms (hot pickup + scheduler grace)

Date: 2026-09-10. Status: accepted.

## Context

Phase 8 acceptance needs voice→band perceived latency < 250 ms on one
transport. Three findings during implementation:

1. **Bar wait.** Planning only at bar boundaries answers a mid-bar voice
   up to one bar late (~900 ms measured E2E before the fix).
2. **ms clock skew.** The planner stamps `audioTime = now`; the scheduler
   samples `now()` fresh at dispatch (1–5 ms later, ms wall clock). Every
   bar plan read "late" in the browser while frozen-clock unit tests stayed
   green — systematic false lates, 0 dispatches, degradation escalating.
3. **E2E hydration.** Dev-server HMR websocket failures in sandboxed CI
   can leave `/session` unhydrated (SSR shell only, frozen Bar 0.00).
   E2E runs green against the production build.

## Decision

- **Hot drum pickup** (`conductor.ts` `maybeHotPickup`): first voice onset
  in a bar schedules that bar's *remaining* groove immediately (base =
  now + 50 ms, synchronous `scheduler.tick()` on the same frame, ≤ 8 hits,
  once per bar). Drums only — pitch-independent by construction, so it
  never clashes with the bar's harmony; pitched instruments still join at
  the next boundary with scored chords. Measured voice→drums ≈ 50–200 ms.
- **Scheduler grace 25 ms** (`scheduler.ts` `LATE_GRACE_SEC`): items ≤ 25 ms
  past still dispatch; only older items count late. Phase 6 contract tests
  (lates 100–500 ms old) stay green.
- **Conductor stamps `now + 20 ms`** for mid-bar bar plans (inaudible,
  absorbs planner/dispatch skew).
- **Transport tick 50 ms** in `useConductor` (2× the 25 ms scheduler tick,
  inside the 120 ms horizon; per-tick cost sub-ms).
- **Look-ahead 120 ms / tick 25 ms CONFIRMED** (no change): horizon covers
  ~0.18 beat @90 BPM; handle p95 (Node) single-digit ms; perceived =
  handle + horizon < 250 ms. Values in `config.audio` + `performance-budget.md`.
- **E2E runs against `next start`** (production build) when dev HMR is
  unavailable; the no-mic path is the `?fixture=g4` / fixture button.

## Consequences

- Voice→band perceived < 250 ms (hot path measured; budget asserted in
  `conductor-latency` + `conductor-sync` tests and the E2E latency badge).
- Long sessions stay late-free (simulated 900 s soak: 0 late, level full).
- Manual instrument pins survive Auto (`config.conductor.pinHoldsAuto`);
  unpin returns control to the ensemble (closes Fase 7 risco 3).
- Single source of dynamics: conductor drives `DynamicsTracker`; the
  pipeline `EnergyNormalizer` remains the rhythm-path follower (Fase 7
  risco 4 → conductor owns the decision, one emitter).
