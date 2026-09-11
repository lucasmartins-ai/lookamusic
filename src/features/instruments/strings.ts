/**
 * Strings engine (Phase 6, §23). Role: sustained pads that swell with
 * energy — whole-bar triads under a slow attack. Synthesis: detuned saw
 * pair (chorus without a chorus unit) through a warm lowpass.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planStrings, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planStringsBar(input: PassageInput, bars: number) {
  return planStrings(input, bars);
}

export function createStringsEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("strings", sink, pitchedTimbreOf("strings"));
}
