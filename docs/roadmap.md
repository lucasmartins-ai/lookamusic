# Roadmap + phase acceptance criteria (§51, §61.17–18)

> **Execution state lives in `STATUS.md`** (current/next phase + todo-list).
> **Executable prompts per phase live in `prompts/fase-XX.md`.**
> **Delivery history lives in `CHANGELOG.md`.** This file stays normative.

Each phase = stable increment. Do not start a phase until prior acceptance passes.
Per-feature done = §60 (impl + tests + errors + perf + docs + arch + UI + a11y + edges + criteria).

- **P0 Specification & research** — THIS DOC SET. Done when: all 18 §61 items exist, TDRs recorded, repo builds empty page + `npm test` green.
- **P1 Audio foundation** — mic perm, AudioContext, Worklet, 2 detectors + benchmark, conversions, diagnostics. Done when: user sings → sees live note + Hz + confidence + latency/load; denial/offline states guided; benchmark picks default with numbers.
- **P2 Musical interpretation** — smoothing, stabilization (no flicker on §9 fixture), onsets/durations, phrases, tempo est, timeline. Done when: sung phrase renders coherent note blocks + phrase boundaries + stable BPM readout.
- **P3 Theory engine** — §13–15,17 + key detection. Done when: theory spec tests pass; C–E–G → C major; key revises with evidence.
- **P4 Harmony** — candidates + scoring + progressions + voice leading + cadence. Done when: melody → ranked chords; G–D–Em–C analyzed I–V–vi–IV in G; 8-bar gen ends tonic, no >2 repeats.
- **P5 Rhythm & tempo** — beat tracking, slew-limited BPM, 4/4+3/4+6/8 patterns, style-driven drums. Done when: drums follow singer's tempo without violent jumps; meter switch stable.
- **P6 Instruments** — 8 engines via iface, synth abstraction, per-inst controls. Done when: same composition renders on any subset; add/remove without engine edits.
- **P7 Arrangement** — boundary transitions, energy/dynamics, style presets as data. Done when: entrances land on bars/phrases with fades; energy mapping audible + visible.
- **P8 Conductor** — full loop integration, sync + latency pass vs budget. Done when: sing → band follows < 250 ms perceived; soak 15 min clean; E2E suite green.
- **P9 Gestures** — camera, landmarks, vocab + hysteresis, arrangement mapping, UI parity. Done when: each gesture triggers reliably without misfires; all actions keyboard-available.
- **P10 UX polish** — identity, responsive, a11y, onboarding, error/empty/loading states. Done when: a11y + mobile pass; new user completes mic→note→band in < 2 min unaided.
- **P11 Recording & editor** — capture/replay/save/timeline editing/regen. Done when: record → edit note/chord/inst → replay identical; project persists locally.
- **P12 Export** — WAV/WebM/MIDI/JSON (MP3/stems/MusicXML evaluated). Done when: exports open in 3rd-party tools (MIDI verified note-for-note).
- **P13 Education** — explanations for notes/intervals/scales/chords/functions/progressions. Done when: C–E–G shows "tríade de C maior"; G–D–Em–C shows "funções I–V–vi–IV em G"; 9 progressive levels, global toggle on/off with zero UI weight when off, live contextual panel in /session, /learn hub + interactive lab. (OK — 516/516 tests, 8/8 E2E).
- **P15 Portfolio release** — build, docs, arch diagram, case study, screenshots, demo, metrics, README, site. Done when: stranger can run + understand + be impressed in 5 min. (OK — build Turbopack 318 ms; README final com quickstart e arquitetura em 1 figura; case study técnico detalhado em docs/case-study.md; galeria visual com 5 screenshots em public/demo/; suíte de smoke test E2E 10/10 verde; 546/546 testes unitários verdes; typecheck 0 erros; PRIVACY.md 100% on-device e licenças de sintetizadores procedurais verificadas).

