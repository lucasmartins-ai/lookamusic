/**
 * Drums engine (Phase 6, §23). Role: meter + energy from the rhythm engine —
 * never pitch. Pattern source: data patterns 4/4, 3/4, 6/8 × style
 * (`features/music/rhythm/patterns.ts`). Synthesis: membranes (sine sweep) +
 * filtered noise; GM midi codes on the MusicalEvent select the recipe.
 */
import type { VoiceSink } from "./audio-sink";
import { EngineBase } from "./engine-base";
import { planDrums, type PassageInput } from "./planning";
import type { InstrumentEngine } from "./types";

export function planDrumsBar(input: PassageInput, bars: number) {
  return planDrums(input, bars);
}

/**
 * Phase 16 wiring (3º da fila): one-shots `freepats-synthesizer-percussion`
 * (CC0 → pack opcional em runtime, nunca no bundle) via
 * `createInstrumentSink` (`config.instruments.samples.drums` +
 * `SampleCache`); sem pack, membrana+ruído procedurais bit-idênticos.
 */
export const DRUMS_SAMPLE_PACK_ID = "freepats-synthesizer-percussion" as const;

export function createDrumsEngine(sink: VoiceSink): InstrumentEngine {
  return new EngineBase("drums", sink, { kind: "drums" });
}
