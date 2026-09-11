/**
 * Guitar engine (Phase 6, §23). Role: strum/arpeggiate — strummed attacks on
 * the strong beats (12 ms string steps), arpeggiated tail. Acoustic voicing
 * by default; `electric: true` selects the brighter timbre (same planning).
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planGuitar, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planGuitarBar(input: PassageInput, bars: number) {
  return planGuitar(input, bars);
}

export function createGuitarEngine(sink: VoiceSink, opts: { electric?: boolean } = {}): InstrumentEngine {
  return new EngineBase("guitar", sink, pitchedTimbreOf(opts.electric ? "guitarElectric" : "guitar"));
}
