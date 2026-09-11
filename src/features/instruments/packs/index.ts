/**
 * Pack registry (Phase 16). Manifests are DATA — engines reference packId
 * only; URLs never appear outside `packs/`.
 */
export * from "./types";
export { PIANO_PACK } from "./piano";
export { VIOLAO_PACK } from "./violao";
export { DRUMS_PACK } from "./drums";

import type { SamplePackManifest } from "./types";
import { PIANO_PACK } from "./piano";
import { VIOLAO_PACK } from "./violao";
import { DRUMS_PACK } from "./drums";

export const SAMPLE_PACKS: Record<string, SamplePackManifest> = {
  [PIANO_PACK.packId]: PIANO_PACK,
  [VIOLAO_PACK.packId]: VIOLAO_PACK,
  [DRUMS_PACK.packId]: DRUMS_PACK,
};

export const PACK_ID_BY_INSTRUMENT: Record<string, string> = {
  piano: PIANO_PACK.packId,
  violao: VIOLAO_PACK.packId,
  drums: DRUMS_PACK.packId,
};
