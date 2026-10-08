/**
 * Piano sample pack: Salamander Grand Piano V3 (Yamaha C5, Alexander
 * Holmberg), 2 velocity layers sampled every minor 3rd (MIDI 21,24,…,108),
 * from the original FLAC release (TDR-22; was the tonejs 1-layer mp3 copy).
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
  // Two recorded dynamics (Salamander v6 ≈ mp, v12 ≈ f): a soft note has the
  // darker timbre of a soft hammer, not just a quieter loud note.
  for (let midi = 21; midi <= 108; midi += 3) {
    notes.push({ midi, url: `${BASE_URL}/${sampleName(midi)}_v6.mp3`, velocity: 0.45 });
    notes.push({ midi, url: `${BASE_URL}/${sampleName(midi)}_v12.mp3`, velocity: 0.85 });
  }
  return notes;
}

export const PIANO_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "salamander-grand-v3-2layer",
  instrument: "piano",
  version: 4,
  license: "CC-BY-3.0",
  attribution:
    "Salamander Grand Piano V3 by Alexander Holmberg — CC-BY 3.0 (https://github.com/sfzinstruments/SalamanderGrandPiano)",
  moreInfoUrl: "https://github.com/sfzinstruments/SalamanderGrandPiano",
  baseUrl: BASE_URL,
  range: { minMidi: 21, maxMidi: 108 },
  notes: buildNotes(),
  // 60 mp3s (30 notas × 2 camadas, 4 s, mono 128 kbps) ≈ 3,8 MB.
  totalBytesEstimate: 3_800_000,
};
