/**
 * Drum patterns as data (Phase 5, §22). Styles × meters live here as plain
 * arrays — never hardcoded in UI or engines. The Phase 6 instrument engines
 * and the Phase 8 scheduler consume `expandPattern` / `renderAccompaniment`;
 * adding a style is adding data, never a branch.
 *
 * Grid: positions in eighth-note units from the bar start (0 = downbeat).
 * 4/4 bars span 8 eighths, 3/4 and 6/8 span 6 (see `meter.ts`). Fractional
 * `.5` steps are sixteenths; the blues shuffle rows use triplet fractions
 * as a documented straight-grid approximation (real swing lands in Phase 6).
 *
 * The accompaniment renderer reads ONLY tempo/onsets-derived density and
 * normalized energy (`RhythmInput`) — pitch can never leak in: the input
 * type has no pitch field, and the pitch-independence test pins it.
 */
import { config } from "@/lib/config";
import type { TempoState, TimeSignature } from "@/domain/types";
import { barEighths, meterKey, type MeterKey } from "./meter";

export type DrumStyleId =
  | "acoustic-pop"
  | "rock"
  | "ballad"
  | "folk"
  | "cinematic"
  | "electronic"
  | "latin"
  | "blues"
  | "ambient";

export type DrumVoice =
  | "kick"
  | "snare"
  | "hihat"
  | "ride"
  | "crash"
  | "tom"
  | "rim"
  | "clap"
  | "shaker"
  | "cajon"
  | "cajon-slap";

export interface DrumHit {
  voice: DrumVoice;
  /** Eighth-note units from bar start; .5 = sixteenth. */
  pos: number;
  /** 0–1. Below `ghostCutVelocity` = droppable ghost note. */
  velocity: number;
}

export interface DrumEvent extends DrumHit {
  /** Zero-based bar index in the expansion. */
  bar: number;
  /** Absolute position in eighth-note units from the expansion start. */
  posEighth: number;
  /** Absolute position in quarter-note beats (scheduler clock). */
  timeQuarters: number;
}

export interface DrumStyleMeta {
  id: DrumStyleId;
  /** pt-BR label for UI. */
  label: string;
  blurb: string;
}

export const DRUM_STYLES: readonly DrumStyleMeta[] = [
  { id: "acoustic-pop", label: "Acústico Pop", blurb: "Cajon-like kick, rim backbeat, bright hats." },
  { id: "rock", label: "Rock", blurb: "Kick/snare backbeat, driving eighths." },
  { id: "ballad", label: "Balada", blurb: "Soft kick, rim clicks, ride wash." },
  { id: "folk", label: "Folk", blurb: "Cajon pulse with slap backbeats." },
  { id: "cinematic", label: "Cinematic", blurb: "Taiko-sized toms, wide crashes." },
  { id: "electronic", label: "Eletrônico", blurb: "Four-on-the-floor, claps, 16th hats." },
  { id: "latin", label: "Latin", blurb: "Syncopated kick, cross-stick, shaker motor." },
  { id: "blues", label: "Blues", blurb: "Shuffle-approx backbeat, warm hats." },
  { id: "ambient", label: "Ambient", blurb: "Sparse shaker breath, ghost rim." },
];

function hits(voices: [DrumVoice, number, number][]): DrumHit[] {
  return voices.map(([voice, pos, velocity]) => ({ voice, pos, velocity }));
}

/**
 * The pattern library: 9 styles × 3 meters. Every row keeps the downbeat
 * (pos 0, no leading gap), stays inside the bar, and carries ≥3 hits so a
 * bar never rings hollow by accident — sparseness is the renderer's job.
 */
export const PATTERNS: Record<DrumStyleId, Record<MeterKey, DrumHit[]>> = {
  "acoustic-pop": {
    "4/4": hits([
      ["crash", 0, 0.7], ["kick", 0, 0.9], ["hihat", 0, 0.55],
      ["hihat", 1, 0.4], ["rim", 2, 0.8], ["hihat", 3, 0.4],
      ["kick", 4, 0.85], ["hihat", 4, 0.55], ["hihat", 5, 0.4],
      ["rim", 6, 0.8], ["kick", 6.5, 0.4], ["hihat", 7, 0.4],
    ]),
    "3/4": hits([
      ["crash", 0, 0.65], ["kick", 0, 0.9], ["hihat", 0, 0.5],
      ["hihat", 1, 0.4], ["rim", 2, 0.75], ["hihat", 3, 0.4],
      ["rim", 4, 0.75], ["hihat", 5, 0.45],
    ]),
    "6/8": hits([
      ["crash", 0, 0.65], ["kick", 0, 0.9], ["hihat", 0, 0.5],
      ["hihat", 1, 0.4], ["hihat", 2, 0.45], ["rim", 3, 0.8],
      ["kick", 3, 0.7], ["hihat", 4, 0.4], ["hihat", 5, 0.45],
    ]),
  },
  rock: {
    "4/4": hits([
      ["crash", 0, 0.85], ["kick", 0, 1], ["hihat", 0, 0.6],
      ["hihat", 1, 0.45], ["snare", 2, 0.95], ["hihat", 2, 0.5],
      ["hihat", 3, 0.45], ["kick", 4, 0.95], ["hihat", 4, 0.6],
      ["hihat", 5, 0.45], ["snare", 6, 0.95], ["hihat", 6, 0.5],
      ["hihat", 7, 0.5], ["snare", 7.5, 0.35],
    ]),
    "3/4": hits([
      ["crash", 0, 0.8], ["kick", 0, 1], ["hihat", 0, 0.6],
      ["hihat", 1, 0.45], ["snare", 2, 0.9], ["hihat", 2, 0.5],
      ["kick", 3, 0.8], ["hihat", 3, 0.5], ["snare", 4, 0.9],
      ["hihat", 4, 0.5], ["hihat", 5, 0.5],
    ]),
    "6/8": hits([
      ["crash", 0, 0.8], ["kick", 0, 1], ["hihat", 0, 0.55],
      ["hihat", 1, 0.45], ["hihat", 2, 0.5], ["snare", 3, 0.95],
      ["kick", 3, 0.7], ["hihat", 3, 0.5], ["hihat", 4, 0.45],
      ["hihat", 5, 0.5],
    ]),
  },
  ballad: {
    "4/4": hits([
      ["ride", 0, 0.55], ["kick", 0, 0.7], ["ride", 1, 0.35],
      ["rim", 2, 0.6], ["ride", 2, 0.45], ["ride", 3, 0.35],
      ["kick", 4, 0.65], ["ride", 4, 0.55], ["ride", 5, 0.35],
      ["rim", 6, 0.6], ["ride", 6, 0.45], ["ride", 7, 0.4],
    ]),
    "3/4": hits([
      ["ride", 0, 0.55], ["kick", 0, 0.7], ["ride", 1, 0.35],
      ["rim", 2, 0.6], ["ride", 2, 0.45], ["ride", 3, 0.35],
      ["rim", 4, 0.6], ["ride", 4, 0.45], ["ride", 5, 0.4],
    ]),
    "6/8": hits([
      ["ride", 0, 0.55], ["kick", 0, 0.7], ["shaker", 1, 0.3],
      ["shaker", 2, 0.3], ["rim", 3, 0.6], ["ride", 3, 0.5],
      ["shaker", 4, 0.3], ["shaker", 5, 0.35],
    ]),
  },
  folk: {
    "4/4": hits([
      ["cajon", 0, 0.9], ["shaker", 0, 0.35], ["shaker", 1, 0.3],
      ["cajon-slap", 2, 0.8], ["shaker", 2, 0.35], ["shaker", 3, 0.3],
      ["cajon", 4, 0.85], ["shaker", 4, 0.35], ["shaker", 5, 0.3],
      ["cajon-slap", 6, 0.8], ["shaker", 6, 0.35], ["shaker", 7, 0.35],
    ]),
    "3/4": hits([
      ["cajon", 0, 0.9], ["shaker", 0, 0.35], ["shaker", 1, 0.3],
      ["cajon-slap", 2, 0.8], ["shaker", 2, 0.35], ["shaker", 3, 0.3],
      ["cajon-slap", 4, 0.8], ["shaker", 4, 0.35], ["shaker", 5, 0.35],
    ]),
    "6/8": hits([
      ["cajon", 0, 0.9], ["shaker", 0, 0.35], ["cajon-slap", 1, 0.5],
      ["cajon-slap", 2, 0.5], ["cajon", 3, 0.85], ["shaker", 3, 0.35],
      ["cajon-slap", 4, 0.5], ["cajon-slap", 5, 0.55],
    ]),
  },
  cinematic: {
    "4/4": hits([
      ["crash", 0, 0.9], ["tom", 0, 0.95], ["tom", 1, 0.4],
      ["tom", 2, 0.6], ["kick", 2, 0.8], ["tom", 3, 0.45],
      ["tom", 4, 0.9], ["kick", 4, 0.75], ["tom", 5, 0.4],
      ["tom", 6, 0.65], ["tom", 7, 0.5],
    ]),
    "3/4": hits([
      ["crash", 0, 0.9], ["tom", 0, 0.95], ["tom", 1, 0.4],
      ["tom", 2, 0.65], ["kick", 2, 0.8], ["tom", 3, 0.45],
      ["tom", 4, 0.7], ["tom", 5, 0.5],
    ]),
    "6/8": hits([
      ["crash", 0, 0.9], ["tom", 0, 0.95], ["tom", 1, 0.4],
      ["tom", 2, 0.5], ["tom", 3, 0.85], ["kick", 3, 0.75],
      ["tom", 4, 0.55], ["tom", 5, 0.6],
    ]),
  },
  electronic: {
    "4/4": hits([
      ["kick", 0, 1], ["hihat", 0, 0.4], ["hihat", 0.5, 0.3],
      ["hihat", 1, 0.4], ["hihat", 1.5, 0.3], ["clap", 2, 0.9],
      ["hihat", 2, 0.4], ["hihat", 2.5, 0.3], ["hihat", 3, 0.4],
      ["hihat", 3.5, 0.3], ["kick", 4, 1], ["hihat", 4, 0.4],
      ["hihat", 4.5, 0.3], ["hihat", 5, 0.4], ["hihat", 5.5, 0.3],
      ["clap", 6, 0.9], ["hihat", 6, 0.4], ["hihat", 6.5, 0.3],
      ["hihat", 7, 0.4], ["hihat", 7.5, 0.35],
    ]),
    "3/4": hits([
      ["kick", 0, 1], ["hihat", 0, 0.4], ["hihat", 0.5, 0.3],
      ["hihat", 1, 0.4], ["hihat", 1.5, 0.3], ["clap", 2, 0.9],
      ["hihat", 2, 0.4], ["hihat", 2.5, 0.3], ["kick", 3, 0.9],
      ["hihat", 3, 0.4], ["hihat", 3.5, 0.3], ["clap", 4, 0.85],
      ["hihat", 4, 0.4], ["hihat", 4.5, 0.3], ["hihat", 5, 0.4],
      ["hihat", 5.5, 0.35],
    ]),
    "6/8": hits([
      ["kick", 0, 1], ["hihat", 0, 0.4], ["hihat", 0.5, 0.3],
      ["hihat", 1, 0.4], ["hihat", 1.5, 0.3], ["hihat", 2, 0.4],
      ["hihat", 2.5, 0.3], ["clap", 3, 0.9], ["kick", 3, 0.9],
      ["hihat", 3, 0.4], ["hihat", 3.5, 0.3], ["hihat", 4, 0.4],
      ["hihat", 4.5, 0.3], ["hihat", 5, 0.4], ["hihat", 5.5, 0.35],
    ]),
  },
  latin: {
    "4/4": hits([
      ["rim", 0, 0.8], ["kick", 0, 0.75], ["shaker", 0, 0.4],
      ["shaker", 0.5, 0.3], ["shaker", 1, 0.4], ["rim", 1.5, 0.35],
      ["rim", 2, 0.7], ["shaker", 2, 0.4], ["shaker", 2.5, 0.3],
      ["kick", 3, 0.7], ["shaker", 3, 0.4], ["rim", 3.5, 0.35],
      ["rim", 4, 0.75], ["shaker", 4, 0.4], ["shaker", 4.5, 0.3],
      ["kick", 5, 0.6], ["shaker", 5, 0.4], ["rim", 5.5, 0.35],
      ["rim", 6, 0.8], ["shaker", 6, 0.4], ["shaker", 6.5, 0.3],
      ["shaker", 7, 0.4], ["shaker", 7.5, 0.35],
    ]),
    "3/4": hits([
      ["rim", 0, 0.8], ["kick", 0, 0.75], ["shaker", 0, 0.4],
      ["shaker", 0.5, 0.3], ["shaker", 1, 0.4], ["rim", 2, 0.7],
      ["shaker", 2, 0.4], ["shaker", 2.5, 0.3], ["kick", 3, 0.7],
      ["shaker", 3, 0.4], ["rim", 4, 0.75], ["shaker", 4, 0.4],
      ["shaker", 4.5, 0.3], ["shaker", 5, 0.4], ["shaker", 5.5, 0.35],
    ]),
    "6/8": hits([
      ["rim", 0, 0.85], ["kick", 0, 0.8], ["shaker", 0, 0.4],
      ["rim", 1, 0.6], ["shaker", 1, 0.35], ["rim", 2, 0.6],
      ["shaker", 2, 0.35], ["rim", 3, 0.8], ["kick", 3, 0.7],
      ["shaker", 3, 0.4], ["rim", 4, 0.6], ["shaker", 4, 0.35],
      ["rim", 5, 0.65], ["shaker", 5, 0.4],
    ]),
  },
  blues: {
    // Triplet fractions ≈ shuffle on a straight grid (see module doc).
    "4/4": hits([
      ["kick", 0, 0.9], ["hihat", 0, 0.5], ["hihat", 4 / 3, 0.35],
      ["snare", 2, 0.9], ["hihat", 2, 0.5], ["kick", 8 / 3, 0.6],
      ["hihat", 10 / 3, 0.35], ["kick", 4, 0.85], ["hihat", 4, 0.5],
      ["hihat", 16 / 3, 0.35], ["snare", 6, 0.9], ["hihat", 6, 0.5],
      ["hihat", 22 / 3, 0.4],
    ]),
    "3/4": hits([
      ["kick", 0, 0.9], ["hihat", 0, 0.5], ["hihat", 4 / 3, 0.35],
      ["snare", 2, 0.9], ["hihat", 2, 0.5], ["hihat", 10 / 3, 0.35],
      ["kick", 4, 0.85], ["hihat", 4, 0.5], ["hihat", 16 / 3, 0.4],
    ]),
    "6/8": hits([
      ["kick", 0, 0.9], ["hihat", 0, 0.5], ["hihat", 1, 0.4],
      ["hihat", 2, 0.45], ["snare", 3, 0.9], ["kick", 3, 0.6],
      ["hihat", 3, 0.5], ["hihat", 4, 0.4], ["hihat", 5, 0.45],
    ]),
  },
  ambient: {
    "4/4": hits([
      ["shaker", 0, 0.4], ["crash", 0, 0.3], ["shaker", 2, 0.25],
      ["rim", 2, 0.3], ["shaker", 4, 0.4], ["shaker", 6, 0.25],
      ["rim", 6, 0.28],
    ]),
    "3/4": hits([
      ["shaker", 0, 0.4], ["crash", 0, 0.3], ["rim", 2, 0.3],
      ["shaker", 3, 0.35], ["shaker", 5, 0.25],
    ]),
    "6/8": hits([
      ["shaker", 0, 0.4], ["crash", 0, 0.3], ["shaker", 2, 0.25],
      ["shaker", 3, 0.4], ["rim", 3, 0.28], ["shaker", 5, 0.25],
    ]),
  },
};

export function patternFor(style: DrumStyleId, meter: TimeSignature): DrumHit[] {
  return PATTERNS[style][meterKey(meter)].map((h) => ({ ...h }));
}

/**
 * Expand a pattern over `bars` consecutive bars. Events are sorted by
 * absolute position, the downbeat of every bar is present, and bar N+1
 * starts exactly where bar N ends — the "no audible gaps" logic the
 * scheduler relies on in Phase 8.
 */
export function expandPattern(style: DrumStyleId, meter: TimeSignature, bars = 1): DrumEvent[] {
  const barLen = barEighths(meter);
  const base = patternFor(style, meter);
  const events: DrumEvent[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (const h of base) {
      const posEighth = bar * barLen + h.pos;
      events.push({ ...h, bar, posEighth, timeQuarters: posEighth / 2 });
    }
  }
  events.sort((a, b) => posEighthOf(a) - posEighthOf(b));
  return events;
}

function posEighthOf(e: DrumEvent): number {
  return e.posEighth;
}

/**
 * Rhythm-only accompaniment input. Deliberately narrow: tempo (with the
 * slew-limited playback clock), meter, onset density, normalized energy.
 * There is intentionally NO pitch/frequency/MIDI field — drums follow the
 * singer's time and intensity, never the melody. Any attempt to pass pitch
 * fails the type checker; the pitch-independence test pins the runtime.
 */
export interface RhythmInput {
  tempo: TempoState;
  meter: TimeSignature;
  /** 0–1 onsets/sec normalized (see TempoEstimator.onsetDensity). */
  density: number;
  /** 0–1 normalized intensity (see EnergyNormalizer). */
  energy01: number;
}

/**
 * Render one bar of drums for `style` driven by density + energy:
 * - sparse (`density < densitySparseBelow`): ghosts (velocity <
 *   `ghostCutVelocity`) and sixteenth subdivisions drop; the downbeat and
 *   structural hits always survive, so the bar never starts with a hole.
 * - dense (`density > densityDenseAbove`): one deterministic pickup ghost
 *   joins the last eighth (skipped when occupied).
 * - every velocity scales by `energyVelocityFloor + (1-floor)*energy01`,
 *   so louder singing hits harder without ever touching raw mic amplitude.
 */
export function renderAccompaniment(input: RhythmInput, style: DrumStyleId): DrumEvent[] {
  const meter = input.meter;
  const barLen = barEighths(meter);
  const density = clamp01(input.density);
  const energy = clamp01(input.energy01);
  const sparse = density < config.rhythm.densitySparseBelow;
  const dense = density > config.rhythm.densityDenseAbove;

  let hits = patternFor(style, meter);
  if (sparse) {
    hits = hits.filter(
      (h) => h.pos === 0 || (h.velocity >= config.rhythm.ghostCutVelocity && Number.isInteger(h.pos)),
    );
  }
  const velocityGain = config.rhythm.energyVelocityFloor + (1 - config.rhythm.energyVelocityFloor) * energy;
  let events: DrumEvent[] = hits.map((h) => ({
    ...h,
    velocity: clamp01(round3(h.velocity * velocityGain)),
    bar: 0,
    posEighth: h.pos,
    timeQuarters: h.pos / 2,
  }));

  if (dense && style !== "ambient") {
    const pickupPos = barLen - 0.5;
    const occupied = events.some((e) => Math.abs(e.pos - pickupPos) < 0.26);
    if (!occupied) {
      events.push({
        voice: "snare",
        pos: pickupPos,
        velocity: clamp01(round3(0.5 * velocityGain)),
        bar: 0,
        posEighth: pickupPos,
        timeQuarters: pickupPos / 2,
      });
    }
  }

  events.sort((a, b) => a.posEighth - b.posEighth);
  return events;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
