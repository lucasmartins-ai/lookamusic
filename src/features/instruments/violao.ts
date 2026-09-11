/**
 * Violão engine (hotfix quarteto). Role: fingerpick/dedilhado — baixo +
 * arpejo em nylon (triangle pelo lowpass cantado), sem o strum duplo da
 * guitarra. Synthesis: triangle + leve shimmer de oitava.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase, pitchedTimbreOf } from "./engine-base";
import { planViolao, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planViolaoBar(input: PassageInput, bars: number) {
  return planViolao(input, bars);
}

/**
 * Phase 16 wiring (2º da fila): pack `freepats-spanish-classical-guitar`
 * (CC0) via `createInstrumentSink` (`config.instruments.samples.violao` +
 * `SampleCache`); sem pack, síntese procedural idêntica à atual.
 */
export const VIOLAO_SAMPLE_PACK_ID = "freepats-spanish-classical-guitar" as const;

export function createViolaoEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("violao", sink, pitchedTimbreOf("violao"));
}
