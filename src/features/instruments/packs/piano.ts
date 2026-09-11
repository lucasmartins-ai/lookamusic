/**
 * Piano sample pack: Salamander Grand Piano V3 (Yamaha C5, Alexander
 * Holmberg), 1 velocity layer sampled every minor 3rd (MIDI 21,24,…,108).
 * License CC-BY-3.0 → credits screen mandatory.
 *
 * Hosting: `tonejs.github.io/audio/salamander` (GitHub Pages, sends
 * `access-control-allow-origin: *`, so cross-origin `fetch` works from the
 * web/PWA and the Tauri webview). File names use `s` for sharps
 * (`Cs`, `Ds`, `Fs`) — same instrument, just a different mirror naming.
 * Remote-only: fetched at runtime under user consent, never bundled.
 */
import type { PitchedPackManifest } from "./types";

const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"] as const;

/** Salamander/tonejs naming: sharps as `s` (e.g. MIDI 27 → "Ds1"). */
function sampleName(midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NAMES[pc]}${octave}`;
}

const BASE_URL = "https://tonejs.github.io/audio/salamander";

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
  version: 2,
  license: "CC-BY-3.0",
  attribution:
    "Salamander Grand Piano by Alexander Holmberg — CC-BY 3.0 (http://freepats.zenvoid.org/Piano/salamander-grand-piano.html)",
  moreInfoUrl: "https://tonejs.github.io/audio/salamander/",
  baseUrl: BASE_URL,
  range: { minMidi: 21, maxMidi: 108 },
  notes: buildNotes(),
  // 30 one-shot mp3s (~66 KB each, single velocity layer) ≈ 1.9 MB.
  totalBytesEstimate: 1_920_000,
};
