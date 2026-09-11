/**
 * Piano sample pack (Phase 16): Salamander Grand Piano (Yamaha C5, Alexander
 * Holmberg), 1 velocity layer (v8) sampled every minor 3rd (MIDI
 * 21,24,…,108). License CC-BY-3.0 → credits screen mandatory.
 * Source: https://tambien.github.io/Piano/Salamander/ (pattern NOTAvVELOCIDADE).
 * Remote-only: fetched at runtime under user consent, never bundled.
 */
import type { PitchedPackManifest } from "./types";

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

function midiNoteName(midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NAMES[pc]}${octave}`;
}

const BASE_URL = "https://tambien.github.io/Piano/Salamander";

function buildNotes(): PitchedPackManifest["notes"] {
  const notes: PitchedPackManifest["notes"] = [];
  for (let midi = 21; midi <= 108; midi += 3) {
    notes.push({ midi, url: `${BASE_URL}/${midiNoteName(midi)}v8.mp3`, velocity: 0.8 });
  }
  // Include the top key explicitly when the minor-3rd grid misses it.
  if ((108 - 21) % 3 !== 0) notes.push({ midi: 108, url: `${BASE_URL}/${midiNoteName(108)}v8.mp3`, velocity: 0.8 });
  return notes;
}

export const PIANO_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "salamander-grand-v8",
  instrument: "piano",
  version: 1,
  license: "CC-BY-3.0",
  attribution: "Salamander Grand Piano by Alexander Holmberg — CC-BY 3.0 (http://freepats.zenvoid.org/Piano/salamander-grand-piano.html)",
  moreInfoUrl: "https://tambien.github.io/Piano/Salamander/",
  baseUrl: BASE_URL,
  range: { minMidi: 21, maxMidi: 108 },
  notes: buildNotes(),
  // 30 one-shot mp3s (~40–60 KB each, single velocity layer).
  totalBytesEstimate: 1_600_000,
};
