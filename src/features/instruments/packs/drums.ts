/**
 * Drum sample pack (Phase 16): Salamander Drumkit one-shots only (kick,
 * snare, hats, ride, crash, toms, rim, clap). License CC-BY-SA-3.0 → NEVER
 * embedded in the bundle; runtime opt-in pack with credits, or swap for CC0
 * one-shots. Source: https://archive.org/details/SalamanderDrumkit
 */
import type { DrumPackManifest } from "./types";

const BASE_URL = "https://archive.org/download/SalamanderDrumkit";

export const DRUMS_PACK: DrumPackManifest = {
  kind: "drums",
  packId: "salamander-drumkit-oneshots",
  instrument: "drums",
  version: 1,
  license: "CC-BY-SA-3.0",
  attribution: "Salamander Drumkit by Alexander Holmberg — CC-BY-SA 3.0 (https://archive.org/details/SalamanderDrumkit)",
  moreInfoUrl: "https://archive.org/details/SalamanderDrumkit",
  baseUrl: BASE_URL,
  voices: [
    { voice: "kick", url: `${BASE_URL}/kick.ogg` },
    { voice: "snare", url: `${BASE_URL}/snare.ogg` },
    { voice: "hihat", url: `${BASE_URL}/hihat-closed.ogg` },
    { voice: "ride", url: `${BASE_URL}/ride.ogg` },
    { voice: "crash", url: `${BASE_URL}/crash.ogg` },
    { voice: "tom", url: `${BASE_URL}/tom.ogg` },
    { voice: "rim", url: `${BASE_URL}/rim.ogg` },
    { voice: "clap", url: `${BASE_URL}/clap.ogg` },
  ],
  totalBytesEstimate: 1_500_000,
};
