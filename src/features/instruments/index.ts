/**
 * Instruments barrel (Phase 6). Pure except `audio-sink` (Web Audio) and
 * `useBand` (React) — import those two only from client components.
 */
export * from "./types";
export * from "./mixer";
export * from "./scheduler";
export * from "./planning";
export * from "./engine-base";
export * from "./registry";
export * from "./sample-cache";
export * from "./sample-store";
export { SampleVoice, createInstrumentSink, shouldUseSamples, inferDrumVoice } from "./sample-voice";
export { WebAudioSink, type VoiceSink, type ToneParams, type NoiseParams } from "./audio-sink";
