/**
 * Piano engine (Phase 6, §23). Role: harmony voicings as broken chords —
 * close-position candidates from the voice-leading beam search, arpeggiated
 * across the bar. Synthesis: triangle + octave shimmer, singing lowpass.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planPiano, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planPianoBar(input: PassageInput, bars: number) {
  return planPiano(input, bars);
}

/**
 * Phase 16 wiring (1º da fila piano → violão → bateria): o som real vem do
 * pack `salamander-grand-v8` (CC-BY-3.0) via `createInstrumentSink`
 * (preferência em `config.instruments.samples.piano.useSamples` +
 * disponibilidade no `SampleCache`); sem pack o sink é o `WebAudioSink`
 * procedural — fallback invisível. O engine não contém URLs (só o packId).
 */
export const PIANO_SAMPLE_PACK_ID = "salamander-grand-v8" as const;

export function createPianoEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("piano", sink, pitchedTimbreOf("piano"));
}
