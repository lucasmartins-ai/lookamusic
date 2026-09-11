# Harmony engine spec (§16–19) — Phase 4

## Input → output

Input: key + scale + recent melody + phrase position + style + prev/current chord.
Output: ranked `ChordCandidate[] = { chord, score 0–1, reasons: HarmonyReason[] }`.
Reasons are human-readable and feed the educational layer ("melody tone E is the 3rd of C").

## Scoring dimensions (weights in config, style-adjustable)

1. Scale compatibility (chord tones ∈ key scale) — hard penalty for out-of-key unless style allows.
2. Melody compatibility (melody pcs vs chord tones; chord-tone +0.3, scale passing tone +0.1, chromatic −0.2).
3. Function & progression (prefer templates I–V–vi–IV etc. as priors, never cages; reward cadential motion V→I, vii°→I at phrase ends).
4. Voice leading (common tones, small movement, instrument range; punish parallel 5ths/8ves in keyboard/strings).
5. Style & repetition (density per style; penalize >2 identical bars unless style = ambient/static).
6. Phrase position (downbeat changes, cadence at `PhraseEnded`).

No random chords: ties broken by seeded PRNG with logged seed (reproducible sessions).

## Progression engine (§18)

Template priors + transition matrix per style; generator proposes 1–4 bar continuations scored as above.
Supports re-harmonization of recorded melody (editor "regenerate accompaniment").

## Voice leading (§19)

Greedy + beam search (width 3) over voicings within instrument range; cost = movement + doublings + parallels.
Phase 4 rule-based; architecture reserves `voicing/optimizer.ts` for later LP/DP upgrade without iface change.

## Cadence detection

Authentic (V→I), plagal (IV→I), deceptive (V→vi), half (→V) at phrase ends → arrangement transition hints + education strings.

## Acceptance (Phase 4)

- C–E–G in C major → C major top-1. G–D–Em–C → progression analysis I–V–vi–IV in G.
- 8-bar generated accompaniment: no consecutive-bar repeats > 2, ends on tonic function, voice-leading movement < 4 semitones/voice avg.
