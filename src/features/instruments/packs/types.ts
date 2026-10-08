/**
 * Sample pack manifests (Phase 16, TDR-16). DATA ONLY — engines never hardcode
 * URLs; they reference `packId` and resolve buffers through `SampleCache` +
 * `SampleVoice`. Since v1.3.3 every pack ships inside the app
 * (`public/samples/**`, same origin); TDR-22 made them the ONLY sound source.
 */

export interface PitchedSampleNote {
  /** MIDI note number of the recorded sample. */
  midi: number;
  /** Bundled audio file (mp3). */
  url: string;
  /**
   * Velocity this layer was recorded at (0–1). Several entries may share a
   * `midi`: the player picks the layer nearest to the note's velocity.
   */
  velocity: number;
}

export interface PitchedPackManifest {
  kind: "pitched";
  packId: string;
  instrument: "piano" | "violao" | "bass" | "violin" | "strings";
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
  /**
   * Linear level trim so every pack's loudest layer peaks near −3 dBFS
   * (banks are recorded at very different levels; TDR-22). Default 1.
   */
  gain?: number;
}

export interface DrumPackVoice {
  voice: string;
  /**
   * Velocity layers, soft → loud; each layer lists round-robin takes that
   * alternate on repeated hits (no "machine-gun" identical strikes).
   */
  layers: string[][];
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
  /** Linear level trim (see PitchedPackManifest.gain). */
  gain?: number;
}

export type SamplePackManifest = PitchedPackManifest | DrumPackManifest;
