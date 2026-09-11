# UI information architecture (§34–37) — instrument, not dashboard

## Identity: LOOKAMUSIC

Dark premium instrument. Restraint: strong type, one accent (amber/gold on near-black),
hairline dividers, no glassmorphism/neon/gradient soup. Feels engineered, not templated.

## Main screen (single viewport, §35)

```
┌───────────────────────────────────────────────┐
│ LOOKAMUSIC        G MAJOR · 84 BPM · 4/4  [●] │
├───────────────────────────────────────────────┤
│                                               │
│   VOICE MELODY — large pitch/note canvas      │
│   "You are singing G4 · 392 Hz · 94%"         │
│                                               │
├───────────────────────────────────────────────┤
│ ACTIVE BAND  [Drums][Bass][Piano][Guitar]     │
│              [Strings][Violin][Sax][Accordion]│
├───────────────────────────────────────────────┤
│ Energy ▓▓▓▓░░  Tempo 84  Key G  Style Ballad  │
│ [ START / SING ]   (●) RECORD                 │
└───────────────────────────────────────────────┘
```

- Priority: state readout → melody canvas → band toggles → musical controls → transport.
- Timeline (melody + chords + bars + phrases) below canvas; grows into editor (Phase 11).
- Diagnostics panel (§50) hidden behind `D` key / "Diagnostics" toggle; never in default view.
- Permission flows: pre-explain → native request → denial recovery card (§43).
- Onboarding: 3-step (allow mic → sing a sustained note → see your note) then reveal band.
- Reduced-motion + keyboard map + contrast AA; every gesture has a control (§44).

## Routes (App Router)

- `/` — instrument (Phase 1: pitch + diagnostics).
- `/session` — full conductor experience (Phase 8).
- `/compose` — lista de composições / hub local (Phase 11 OK).
- `/compose/[id]` — editor de timeline: notas, quantização, acordes, regeneração harmônica, mixer e replay (Phase 11 OK).
- `/learn` — education (Phase 13).
