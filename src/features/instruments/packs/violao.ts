/**
 * Violão sample pack (Phase 16): FreePats Spanish Classical Guitar (nylon).
 * License CC0 — no credit required (we credit anyway). WAV ~7 MB upstream →
 * ogg in the runtime pack (< 3 MB). Remote-only, consent-gated, never bundled.
 * Source: https://github.com/freepats/spanish-classical-guitar
 */
import type { PitchedPackManifest } from "./types";

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

function midiNoteName(midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NAMES[pc]}${octave}`;
}

const BASE_URL = "https://freepats.zenvoid.org/Guitar/spanish-classical-guitar/ogg";

function buildNotes(): PitchedPackManifest["notes"] {
  const notes: PitchedPackManifest["notes"] = [];
  // Classical guitar tessitura E2–E6 (MIDI 40–88), sampled every whole tone;
  // SampleVoice retunes ±2 st via playbackRate, so coverage stays exact.
  for (let midi = 40; midi <= 88; midi += 2) {
    notes.push({ midi, url: `${BASE_URL}/${midiNoteName(midi)}.ogg`, velocity: 0.8 });
  }
  return notes;
}

export const VIOLAO_PACK: PitchedPackManifest = {
  kind: "pitched",
  packId: "freepats-spanish-classical-guitar",
  instrument: "violao",
  version: 1,
  license: "CC0",
  attribution: "FreePats Spanish Classical Guitar — CC0 (https://github.com/freepats/spanish-classical-guitar)",
  moreInfoUrl: "https://github.com/freepats/spanish-classical-guitar",
  baseUrl: BASE_URL,
  range: { minMidi: 40, maxMidi: 88 },
  notes: buildNotes(),
  totalBytesEstimate: 2_400_000,
};
