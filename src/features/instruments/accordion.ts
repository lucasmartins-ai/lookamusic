/**
 * Accordion engine (Phase 6, §23). Role: chordal sustain for folk/latin
 * colors — full triads re-articulated every beat (bellows pulse).
 * Synthesis: musette squares (±8 cents) through a reedy lowpass.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planAccordion, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planAccordionBar(input: PassageInput, bars: number) {
  return planAccordion(input, bars);
}

export function createAccordionEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("accordion", sink, pitchedTimbreOf("accordion"));
}
