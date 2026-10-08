/**
 * Drum sample pack: Virtuosity Drums (Versilian Studios + Karoryfer), CC0 —
 * a real acoustic jazz/club kit (TDR-22; replaces the FreePats
 * "Synthesizer Percussion" kit, which was a synth recording).
 *
 * Each hit is the mix of the kick, snare, overhead and room microphones
 * (`scripts/fetch-sample-packs.mjs`), 3 velocity layers × 2 round-robin takes
 * per voice. Voices the kit does not have are mapped to the closest real
 * strike (clap → snare rimshot, shaker → hi-hat pedal, cajón → kick / muted
 * snare) — never to synthesis.
 */
import type { DrumPackManifest } from "./types";

const BASE_URL = "/samples/drums";
const VOICES = ["kick", "snare", "hihat", "ride", "crash", "tom", "rim", "clap", "shaker", "cajon", "cajon-slap"] as const;

export const DRUMS_PACK: DrumPackManifest = {
  kind: "drums",
  packId: "virtuosity-drums",
  instrument: "drums",
  version: 4,
  license: "CC0",
  attribution:
    "Virtuosity Drums by Versilian Studios & Karoryfer Samples — CC0 (https://github.com/sfzinstruments/virtuosity_drums)",
  moreInfoUrl: "https://github.com/sfzinstruments/virtuosity_drums",
  baseUrl: BASE_URL,
  voices: VOICES.map((voice) => ({
    voice,
    layers: [1, 2, 3].map((l) => [1, 2].map((r) => `${BASE_URL}/${voice}_l${l}_r${r}.mp3`)),
  })),
  // 66 one-shots mono 128 kbps (0,6–3,5 s) ≈ 1,6 MB no instalador.
  totalBytesEstimate: 1_600_000,
  // TDR-23 mix: measured −18 LUFS for the kit vs −24.6 piano on a real take
  // ("bateria muito forte") → −8 dB, sits ~2 dB under piano/violão.
  gain: 0.4,
};
