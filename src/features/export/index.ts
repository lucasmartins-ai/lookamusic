/**
 * Export module facade (Phase 12, §40).
 * Provides unified interfaces for exporting compositions to JSON, MIDI, WAV, and WebM.
 */
export * from "./json";
export * from "./midi";
export * from "./wav";
export * from "./webm";

export type ExportFormat = "json" | "midi" | "wav" | "webm";

export interface ExportResult {
  format: ExportFormat;
  filename: string;
  blob: Blob;
  durationSec?: number;
}
