/**
 * Drum sample pack: FreePats "Synthesizer Percussion" one-shots.
 * License CC0 → safe to fetch at runtime and credit anyway.
 *
 * Hosting: `raw.githubusercontent.com/freepats/synthesizer-percussion`
 * (`access-control-allow-origin: *`). Only the voices upstream actually
 * recorded are listed: any voice missing here (e.g. cajon) simply delegates
 * to the procedural `WebAudioSink`, so the kit never goes silent.
 * Remote-only, consent-gated, never bundled.
 */
import type { DrumPackManifest } from "./types";

const BASE_URL = "https://raw.githubusercontent.com/freepats/synthesizer-percussion/HEAD/samples";

export const DRUMS_PACK: DrumPackManifest = {
  kind: "drums",
  packId: "freepats-synthesizer-percussion",
  instrument: "drums",
  version: 2,
  license: "CC0",
  attribution:
    "FreePats Synthesizer Percussion — CC0 (https://github.com/freepats/synthesizer-percussion)",
  moreInfoUrl: "https://github.com/freepats/synthesizer-percussion",
  baseUrl: BASE_URL,
  voices: [
    { voice: "kick", url: `${BASE_URL}/Kick04.flac` },
    { voice: "snare", url: `${BASE_URL}/Snare09.flac` },
    { voice: "hihat", url: `${BASE_URL}/ClosedHiHat01-01.flac` },
    { voice: "ride", url: `${BASE_URL}/Cymbal02.flac` },
    { voice: "crash", url: `${BASE_URL}/Cymbal01-01.flac` },
    { voice: "tom", url: `${BASE_URL}/MidTom02-01.flac` },
    { voice: "rim", url: `${BASE_URL}/Claves01.flac` },
    { voice: "clap", url: `${BASE_URL}/Clap01.flac` },
    { voice: "shaker", url: `${BASE_URL}/Shaker04.flac` },
  ],
  // 9 FLAC one-shots (~70 KB average) ≈ 0.6 MB.
  totalBytesEstimate: 620_000,
};
