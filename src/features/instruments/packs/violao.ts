/**
 * Violão sample pack: FreePats Spanish Classical Guitar (nylon).
 * License CC0 — no credit required (we credit anyway).
 *
 * Hosting: `raw.githubusercontent.com/freepats/spanish-classical-guitar`
 * (sends `access-control-allow-origin: *`). Upstream ships lossless FLAC, so
 * the download is larger than a compressed pack; the transfer budget in
 * `config.instruments.samples.violao` reflects the real weight.
 *
 * Sharp notes live in files named `C#2.flac` etc. — `#` MUST be
 * percent-encoded (`%23`) or the URL fragment truncates the path to 404.
 * Remote-only, consent-gated, never bundled.
 */
import type { PitchedPackManifest } from "./types";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Upstream file name: sharps as `#`, percent-encoded for the URL. */
function sampleFile(midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return encodeURIComponent(`${NAMES[pc]}${octave}.flac`);
}

const BASE_URL = "https://raw.githubusercontent.com/freepats/spanish-classical-guitar/HEAD/samples";

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
  version: 2,
  license: "CC0",
  attribution:
    "FreePats Spanish Classical Guitar — CC0 (https://github.com/freepats/spanish-classical-guitar)",
  moreInfoUrl: "https://github.com/freepats/spanish-classical-guitar",
  baseUrl: BASE_URL,
  // Coverage window: every MIDI here is within ±2 st of a real sample.
  range: { minMidi: 29, maxMidi: 86 },
  notes: buildNotes(),
  // 48 lossless FLAC one-shots (~80 KB each) ≈ 3.8 MB.
  totalBytesEstimate: 3_900_000,
};
