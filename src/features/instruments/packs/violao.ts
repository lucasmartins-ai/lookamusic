/**
 * Violão sample pack: FreePats Spanish Classical Guitar (nylon).
 * License CC0 — no credit required (we credit anyway).
 *
 * ENTREGUE COM O APP (v1.3.3): os áudios vivem em `public/samples/violao/` e
 * carregam da mesma origem — sem clique em "baixar", sem CORS, sem rede.
 * O FLAC lossless upstream foi transcodificado para mp3 mono 128 kbps, 4 s com
 * fade (`scripts/fetch-sample-packs.mjs`): mesma sonoridade de dedilhado num
 * arquivo ~6× menor, decodificável por todos os webviews alvo.
 *
 * Nomes locais usam `s` para sustenidos (`Cs2.mp3`) — URL nunca leva `#`, que
 * truncaria o caminho como fragmento (bug real do pack remoto).
 */
import type { PitchedPackManifest } from "./types";

const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"] as const;

/** Nome local do sample: sustenido como `s` (nunca `#`). */
function sampleFile(midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NAMES[pc]}${octave}.mp3`;
}

const BASE_URL = "/samples/violao";

/**
 * The exact MIDI notes upstream recorded (G1…C6). Kept explicit so a typo'd
 * derive loop can never silently point at a non-existent file; the residual
 * between neighbours is ≤ 1 st and is retuned via playbackRate.
 */
const SAMPLED_MIDI: readonly number[] = [
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 45, 47, 48, 50, 52, 53, 54, 55, 56, 57, 58, 59,
  60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84,
];

function buildNotes(): PitchedPackManifest["notes"] {
  return SAMPLED_MIDI.map((midi) => ({
    midi,
    url: `${BASE_URL}/${sampleFile(midi)}`,
    velocity: 0.8,
  }));
}

export const VIOLAO_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "freepats-spanish-classical-guitar",
  instrument: "violao",
  version: 3,
  license: "CC0",
  attribution:
    "FreePats Spanish Classical Guitar — CC0 (https://github.com/freepats/spanish-classical-guitar)",
  moreInfoUrl: "https://github.com/freepats/spanish-classical-guitar",
  baseUrl: BASE_URL,
  // Coverage window: every MIDI here is within ±2 st of a real sample.
  range: { minMidi: 29, maxMidi: 86 },
  notes: buildNotes(),
  // 48 mp3 mono empacotados (~48 KB cada, 4 s) ≈ 2,3 MB no instalador.
  totalBytesEstimate: 2_350_000,
};
