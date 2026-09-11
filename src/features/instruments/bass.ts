/**
 * Bass engine (Phase 6, §23). Role: roots + fifths, phrase-anchored
 * (accented root on phrase-boundary downbeats). Synthesis: triangle through
 * a dark lowpass — felt more than heard.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planBass, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planBassBar(input: PassageInput, bars: number) {
  return planBass(input, bars);
}

export function createBassEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("bass", sink, pitchedTimbreOf("bass"));
}
