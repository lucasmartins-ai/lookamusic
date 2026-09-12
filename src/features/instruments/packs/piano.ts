/**
 * Piano sample pack: Salamander Grand Piano V3 (Yamaha C5, Alexander
 * Holmberg), 1 velocity layer sampled every minor 3rd (MIDI 21,24,…,108).
 * License CC-BY-3.0 → credits screen mandatory.
 *
 * ENTREGUE COM O APP (v1.3.3): os mp3 vivem em `public/samples/piano/` e
 * carregam da mesma origem — sem clique em "baixar", sem CORS, sem rede.
 * Cortados em 4 s com fade (ver `scripts/fetch-sample-packs.mjs`): o pack fica
 * em memória como PCM decodificado e a cauda original de 16 s custaria
 * ~5,6 MB de RAM por nota. File names use `s` for sharps (`Cs`, `Ds`, `Fs`).
 */
import type { PitchedPackManifest } from "./types";

const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"] as const;

/** Salamander/tonejs naming: sharps as `s` (e.g. MIDI 27 → "Ds1"). */
function sampleName(midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NAMES[pc]}${octave}`;
}

const BASE_URL = "/samples/piano";

function buildNotes(): PitchedPackManifest["notes"] {
  const notes: PitchedPackManifest["notes"] = [];
  // Minor-3rd grid 21 (A0) … 108 (C8); ±1 st residual is retuned at playback.
  for (let midi = 21; midi <= 108; midi += 3) {
    notes.push({ midi, url: `${BASE_URL}/${sampleName(midi)}.mp3`, velocity: 0.8 });
  }
  return notes;
}

export const PIANO_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "salamander-grand-v8",
  instrument: "piano",
  version: 3,
  license: "CC-BY-3.0",
  attribution:
    "Salamander Grand Piano by Alexander Holmberg — CC-BY 3.0 (http://freepats.zenvoid.org/Piano/salamander-grand-piano.html)",
  moreInfoUrl: "https://tonejs.github.io/audio/salamander/",
  baseUrl: BASE_URL,
  range: { minMidi: 21, maxMidi: 108 },
  notes: buildNotes(),
  // 30 mp3s empacotados (~64 KB cada, 1 camada, 4 s) ≈ 1,9 MB no instalador.
  totalBytesEstimate: 1_950_000,
};
