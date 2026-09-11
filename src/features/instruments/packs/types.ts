/**
 * Sample pack manifests (Phase 16, TDR-16). DATA ONLY — engines never hardcode
 * URLs; they reference `packId` and resolve buffers through `SampleCache` +
 * `SampleVoice`. All URLs are remote https fetched at runtime under explicit
 * user consent — nothing is bundled (web or Tauri stay lean).
 */

export interface PitchedSampleNote {
  /** MIDI note number of the recorded sample. */
  midi: number;
  /** Remote audio file (ogg/mp3, single velocity layer). */
  url: string;
  /** Velocity layer 0–1 (1 layer in Phase 16). */
  velocity: number;
}

export interface PitchedPackManifest {
  kind: "pitched";
  packId: string;
  instrument: "piano" | "violao";
  version: number;
  license: string;
  attribution: string;
  moreInfoUrl: string;
  baseUrl: string;
  /** MIDI range covered (inclusive). Every note inside must be within ±2st of a sample. */
  range: { minMidi: number; maxMidi: number };
  notes: PitchedSampleNote[];
  /** Estimated transfer weight in bytes (single layer, compressed). */
  totalBytesEstimate: number;
}

export interface DrumPackVoice {
  voice: string;
  url: string;
}

export interface DrumPackManifest {
  kind: "drums";
  packId: string;
  instrument: "drums";
  version: number;
  license: string;
  attribution: string;
  moreInfoUrl: string;
  baseUrl: string;
  voices: DrumPackVoice[];
  totalBytesEstimate: number;
}

export type SamplePackManifest = PitchedPackManifest | DrumPackManifest;
