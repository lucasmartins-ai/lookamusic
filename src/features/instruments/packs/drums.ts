/**
 * Drum sample pack: FreePats "Synthesizer Percussion" one-shots.
 * License CC0 → credit anyway.
 *
 * ENTREGUE COM O APP (v1.3.3): os áudios vivem em `public/samples/drums/` e
 * carregam da mesma origem — sem clique em "baixar", sem CORS, sem rede.
 * FLAC upstream transcodificado para mp3 mono (`scripts/fetch-sample-packs.mjs`).
 * Só as vozes que o upstream realmente gravou estão listadas: qualquer voz
 * ausente (ex. cajon) delega ao `WebAudioSink` nativo, então o kit nunca fica
 * mudo.
 */
import type { DrumPackManifest } from "./types";

const BASE_URL = "/samples/drums";

export const DRUMS_PACK: DrumPackManifest = {
  kind: "drums",
  packId: "freepats-synthesizer-percussion",
  instrument: "drums",
  version: 3,
  license: "CC0",
  attribution:
    "FreePats Synthesizer Percussion — CC0 (https://github.com/freepats/synthesizer-percussion)",
  moreInfoUrl: "https://github.com/freepats/synthesizer-percussion",
  baseUrl: BASE_URL,
  voices: [
    { voice: "kick", url: `${BASE_URL}/kick.mp3` },
    { voice: "snare", url: `${BASE_URL}/snare.mp3` },
    { voice: "hihat", url: `${BASE_URL}/hihat.mp3` },
    { voice: "ride", url: `${BASE_URL}/ride.mp3` },
    { voice: "crash", url: `${BASE_URL}/crash.mp3` },
    { voice: "tom", url: `${BASE_URL}/tom.mp3` },
    { voice: "rim", url: `${BASE_URL}/rim.mp3` },
    { voice: "clap", url: `${BASE_URL}/clap.mp3` },
    { voice: "shaker", url: `${BASE_URL}/shaker.mp3` },
  ],
  // 9 mp3 one-shots empacotados ≈ 140 KB no instalador.
  totalBytesEstimate: 140_000,
};
