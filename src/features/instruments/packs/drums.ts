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
/**
 * Kit balance (TDR-24). Every piece ships normalized to the same peak, which
 * made sustained cymbals as loud as the kick ("só bate o prato"). Measured on a
 * real take (K-weighted LUFS per piece): kick −27.7, snare −31.1, hats −41.1,
 * crash (section starts only) −34.9 — kick/snare in front, hats ~10 dB back.
 * The snare's short transient needs > 1 to sit with the kick.
 */
const KIT_BALANCE: Record<string, number> = {
  kick: 1,
  snare: 2,
  tom: 1.2,
  rim: 1,
  clap: 1,
  cajon: 1,
  "cajon-slap": 1.2,
  hihat: 1.4,
  shaker: 1,
  ride: 0.5,
  crash: 0.3,
};
const VOICES = Object.keys(KIT_BALANCE);

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
    gain: KIT_BALANCE[voice],
  })),
  // 66 one-shots mono 128 kbps (0,6–3,5 s) ≈ 1,6 MB no instalador.
  totalBytesEstimate: 1_600_000,
  // TDR-23/24 mix: whole kit ≈ −26 LUFS vs piano −24.4 / violão −24.1 on a
  // real take (was −18, "bateria muito forte"), with KIT_BALANCE inside.
  gain: 0.7,
};
