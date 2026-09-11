/**
 * Arrangement + style presets as DATA (Phase 7, §55). Adding a style is
 * adding an object (or calling `registerStyle` at runtime) — never an
 * engine branch. Engines read `style.drums` (a `DrumStyleId` straight into
 * the pattern library) and the behavior tags descriptively; the sounding
 * behavior lives in the planners, which take the style id as input.
 *
 * Energy mapping is data too: `ENERGY_ENSEMBLE` (who plays) and
 * `ENERGY_DENSITY` (how busy) are plain records keyed by level. Low sits
 * under `densitySparseBelow` (ghosts drop) and high over `densityDenseAbove`
 * (deterministic pickup) so the renderer semantics from Phase 5 apply.
 */
import type { ArrangementState, InstrumentId } from "@/domain/types";
import { PATTERNS, type DrumStyleId } from "../rhythm/patterns";
import type { EnergyLevel } from "../rhythm/energy";

/** Verbatim the spec §55 shape, plus a pt-BR display `label`. */
export interface MusicalStyle {
  id: string;
  /** pt-BR label for UI (display only, never a behavior key). */
  label: string;
  bpmRange: [number, number];
  harmonicDensity: "sparse" | "medium" | "dense";
  drums: DrumStyleId;
  bass: string;
  piano: string;
  guitar: string;
  strings: string;
  dynamics: string;
  defaults: Partial<ArrangementState>;
}

/** Who plays per energy level: few → mid → all (audible + visible). */
export const ENERGY_ENSEMBLE: Record<EnergyLevel, readonly InstrumentId[]> = {
  low: ["drums", "bass", "piano", "guitar"],
  medium: ["drums", "bass", "piano", "guitar", "strings"],
  high: ["drums", "bass", "piano", "guitar", "strings", "violin", "sax", "accordion"],
};

/** How busy per energy level (0–1, feeds the accompaniment renderer). */
export const ENERGY_DENSITY: Record<EnergyLevel, number> = {
  low: 0.25,
  medium: 0.55,
  high: 0.85,
};

function quartet(): Record<InstrumentId, boolean> {
  return {
    drums: true,
    bass: true,
    piano: true,
    guitar: true,
    strings: false,
    violin: false,
    sax: false,
    accordion: false,
  };
}

const BUILTINS: MusicalStyle[] = [
  {
    id: "neutral",
    label: "Neutro",
    bpmRange: [70, 110],
    harmonicDensity: "medium",
    drums: "acoustic-pop",
    bass: "root-and-fifth",
    piano: "broken-chord",
    guitar: "strum",
    strings: "pad",
    dynamics: "follow-energy",
    defaults: { energy: 0.5, active: quartet() },
  },
  {
    id: "ballad",
    label: "Balada",
    bpmRange: [60, 85],
    harmonicDensity: "sparse",
    drums: "ballad",
    bass: "root-and-fifth",
    piano: "broken-chord",
    guitar: "arpeggiate",
    strings: "pad-swell",
    dynamics: "follow-energy",
    defaults: { energy: 0.4, active: quartet() },
  },
  {
    id: "rock",
    label: "Rock",
    bpmRange: [100, 140],
    harmonicDensity: "dense",
    drums: "rock",
    bass: "driving-eighths",
    piano: "power-chords",
    guitar: "strum-drive",
    strings: "pad",
    dynamics: "follow-energy",
    defaults: { energy: 0.7, active: quartet() },
  },
  {
    id: "folk",
    label: "Folk",
    bpmRange: [80, 115],
    harmonicDensity: "medium",
    drums: "folk",
    bass: "root-and-fifth",
    piano: "broken-chord",
    guitar: "fingerpick",
    strings: "pad",
    dynamics: "follow-energy",
    defaults: { energy: 0.5, active: quartet() },
  },
  {
    id: "ambient",
    label: "Ambient",
    bpmRange: [50, 80],
    harmonicDensity: "sparse",
    drums: "ambient",
    bass: "drone-root",
    piano: "sparse-chord",
    guitar: "texture",
    strings: "long-pad",
    dynamics: "follow-energy",
    defaults: { energy: 0.3, active: quartet() },
  },
];

const REGISTRY = new Map<string, MusicalStyle>(BUILTINS.map((s) => [s.id, { ...s }]));

function assertStyle(s: MusicalStyle): void {
  if (!s || typeof s.id !== "string" || s.id.trim() === "") {
    throw new Error("style needs a non-empty id");
  }
  if (!(s.drums in PATTERNS)) throw new Error(`unknown drum pattern: ${String(s.drums)}`);
  const [lo, hi] = s.bpmRange ?? [];
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi < lo) {
    throw new Error(`bad bpmRange for style ${s.id}`);
  }
  if (s.harmonicDensity !== "sparse" && s.harmonicDensity !== "medium" && s.harmonicDensity !== "dense") {
    throw new Error(`bad harmonicDensity for style ${s.id}`);
  }
}

/**
 * Register a new style at runtime — data only, no engine change. Throws on
 * duplicate id or invalid shape (unknown drum pattern, bad bpmRange).
 */
export function registerStyle(style: MusicalStyle): void {
  assertStyle(style);
  if (REGISTRY.has(style.id)) throw new Error(`style already registered: ${style.id}`);
  REGISTRY.set(style.id, { ...style, defaults: { ...style.defaults } });
}

/** Resolve by id; unknown ids fall back to `neutral` (never crash the UI). */
export function styleById(id: string): MusicalStyle {
  return REGISTRY.get(id) ?? (REGISTRY.get("neutral") as MusicalStyle);
}

export function listStyles(): MusicalStyle[] {
  return [...REGISTRY.values()];
}

/** Drum pattern id for the planners (style → pattern library, no branch). */
export function styleDrums(id: string): DrumStyleId {
  return styleById(id).drums;
}

/** Who plays at `level` (copy — mutate freely). */
export function ensembleForEnergy(level: EnergyLevel): InstrumentId[] {
  return [...ENERGY_ENSEMBLE[level]];
}

/** How busy at `level` (0–1). */
export function densityForEnergy(level: EnergyLevel): number {
  return ENERGY_DENSITY[level];
}
