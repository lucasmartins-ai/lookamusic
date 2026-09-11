# TDR-04 — Pure domain/theory layers

Date: 2026-09-10. Status: accepted.

Context: §53 boundaries; testability without browsers/audio hardware.
Decision: `src/domain` and `src/features/music/theory` are pure TS (types + math + seeded scoring only). No imports from React, Web Audio, or feature infra. Violations fail review; future lint rule.
