/**
 * Real-instrument packs added in TDR-22 ("só sons reais"): double bass,
 * solo violin and violin section. Recorded acoustic instruments only;
 * mp3 mono, 2 dynamics each (see `scripts/fetch-sample-packs.mjs`).
 * Local file names: `<Note><octave>_<layer>.mp3`, sharps as `s`.
 */
import type { PitchedPackManifest } from "./types";

const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"] as const;
const nameOf = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

function layered(base: string, midis: readonly number[], layers: readonly [string, number][]): PitchedPackManifest["notes"] {
  return midis.flatMap((midi) => layers.map(([suffix, velocity]) => ({ midi, url: `${base}/${nameOf(midi)}_${suffix}.mp3`, velocity })));
}

/** C1 Eb1 G1 Bb1 D2 F2 A2 C3 E3 G3 A3 (pizz grid as recorded). */
const BASS_MIDIS = [24, 27, 31, 34, 38, 41, 45, 48, 52, 55, 57] as const;

export const BASS_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "dsmolken-double-bass-pizz",
  instrument: "bass",
  version: 1,
  license: "Royalty-free",
  attribution:
    "D. Smolken Double Bass (1958 Otto Rubner) — royalty-free for all commercial and non-commercial use (https://github.com/sfzinstruments/dsmolken.double-bass)",
  moreInfoUrl: "https://github.com/sfzinstruments/dsmolken.double-bass",
  baseUrl: "/samples/bass",
  range: { minMidi: 24, maxMidi: 59 },
  notes: layered("/samples/bass", BASS_MIDIS, [["p", 0.45], ["f", 0.85]]),
  totalBytesEstimate: 900_000,
  // Loud layer peaks −0.4 dBFS → trim to ≈ −3 dB.
  gain: 0.74,
};

/** G3 A3 C4 E4 G4 A4 C5 E5 G5 A5 C6 E6 G6 A6 C7. */
const VIOLIN_MIDIS = [55, 57, 60, 64, 67, 69, 72, 76, 79, 81, 84, 88, 91, 93, 96] as const;

export const VIOLIN_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "vsco2-solo-violin-arco",
  instrument: "violin",
  version: 1,
  license: "CC0",
  attribution: "VSCO-2 Community Edition, Solo Violin (Versilian Studios) — CC0 (https://github.com/sgossner/VSCO-2-CE)",
  moreInfoUrl: "https://github.com/sgossner/VSCO-2-CE",
  baseUrl: "/samples/violin",
  range: { minMidi: 55, maxMidi: 96 },
  notes: layered("/samples/violin", VIOLIN_MIDIS, [["p", 0.45], ["f", 0.85]]),
  totalBytesEstimate: 1_900_000,
  // Loud layer peaks −7.6 dBFS → +4.6 dB.
  gain: 1.7,
};

/** G2 A2 B2 D3 F#3 A3 C4 E4 G4 B4 D5. */
const STRINGS_MIDIS = [43, 45, 47, 50, 54, 57, 60, 64, 67, 71, 74] as const;

export const STRINGS_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "vsco2-violin-section-sus",
  instrument: "strings",
  version: 1,
  license: "CC0",
  attribution: "VSCO-2 Community Edition, Violin Section (Versilian Studios) — CC0 (https://github.com/sgossner/VSCO-2-CE)",
  moreInfoUrl: "https://github.com/sgossner/VSCO-2-CE",
  baseUrl: "/samples/strings",
  range: { minMidi: 43, maxMidi: 76 },
  notes: layered("/samples/strings", STRINGS_MIDIS, [["v1", 0.45], ["v2", 0.85]]),
  totalBytesEstimate: 1_400_000,
  // Loud layer peaks −12.7 dBFS; a sustained pad sits under the band → +8 dB.
  gain: 2.5,
};
