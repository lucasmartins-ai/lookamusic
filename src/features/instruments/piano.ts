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

export function createPianoEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("piano", sink, pitchedTimbreOf("piano"));
}
