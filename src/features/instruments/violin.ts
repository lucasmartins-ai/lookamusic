/**
 * Violin engine (Phase 6, §23). Role: lead doubling / counter-melody that
 * enters on arrangement boundaries — phrase-start bars only, silent
 * otherwise (Phase 7 cues drive the entries). Synthesis: solo saw with a
 * vocal lowpass and a gentle attack.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planViolin, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planViolinBar(input: PassageInput, bars: number) {
  return planViolin(input, bars);
}

export function createViolinEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("violin", sink, pitchedTimbreOf("violin"));
}
