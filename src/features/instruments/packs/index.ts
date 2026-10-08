/**
 * Pack registry (Phase 16, TDR-22). Manifests are DATA — engines reference
 * packId only; URLs never appear outside `packs/`.
 */
export * from "./types";
export { PIANO_PACK } from "./piano";
export { VIOLAO_PACK } from "./violao";
export { DRUMS_PACK } from "./drums";
export { BASS_PACK, VIOLIN_PACK, STRINGS_PACK } from "./acoustic";

import type { SamplePackManifest } from "./types";
import { PIANO_PACK } from "./piano";
import { VIOLAO_PACK } from "./violao";
import { DRUMS_PACK } from "./drums";
import { BASS_PACK, VIOLIN_PACK, STRINGS_PACK } from "./acoustic";

/** Instrument → its real-sound pack. Instruments absent here have NO real sound. */
export const PACK_BY_INSTRUMENT: Record<string, SamplePackManifest> = {
  piano: PIANO_PACK,
  violao: VIOLAO_PACK,
  drums: DRUMS_PACK,
  bass: BASS_PACK,
  violin: VIOLIN_PACK,
  strings: STRINGS_PACK,
};

export const SAMPLE_PACKS: Record<string, SamplePackManifest> = Object.fromEntries(
  Object.values(PACK_BY_INSTRUMENT).map((p) => [p.packId, p]),
);

export const PACK_ID_BY_INSTRUMENT: Record<string, string> = Object.fromEntries(
  Object.entries(PACK_BY_INSTRUMENT).map(([id, p]) => [id, p.packId]),
);

/** Every bundled audio URL of a pack (all layers / round-robins). */
export function packUrls(pack: SamplePackManifest): string[] {
  return pack.kind === "pitched" ? pack.notes.map((n) => n.url) : pack.voices.flatMap((v) => v.layers.flat());
}
