# TDR-02 — Raw Web Audio first; Tone.js deferred

Date: 2026-09-10. Status: accepted.

Context: spec §6 allows Tone.js "where useful"; §24–25 demand low latency + predictable scheduling.
Decision: Phases 1–5 use raw Web Audio + AudioWorklet + hand-rolled look-ahead scheduler.
Tone.js may enter at Phase 6+ only if it demonstrably reduces scheduler code with no latency/CPU regression (A/B with diagnostics numbers).
Trade-off: more hand-written scheduler code now; full control over hot path and bundle size.
