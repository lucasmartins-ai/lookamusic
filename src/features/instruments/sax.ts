/**
 * Sax engine (Phase 6, §23). Role: melodic fills on the last beat of the
 * bar, mid-energy and above only — below the floor the horn stays out of
 * the way. Synthesis: breathy saw through a tight lowpass.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planSax, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planSaxBar(input: PassageInput, bars: number) {
  return planSax(input, bars);
}

export function createSaxEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("sax", sink, pitchedTimbreOf("sax"));
}
