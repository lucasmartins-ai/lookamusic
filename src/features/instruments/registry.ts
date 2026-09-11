/**
 * Instrument registry (Phase 6, §23). New instrument = 1 file + 1 row here;
 * the conductor, scheduler, mixer and UI never change. `registerInstrument`
 * stays public so future packs (and the architecture test's fictitious
 * kazoo) plug in without touching this file's eight canonical rows.
 */
import { INSTRUMENTS } from "@/domain/types";
import type { VoiceSink } from "./audio-sink";
import type { EngineFactory, InstrumentEngine } from "./types";
import { createDrumsEngine } from "./drums";
import { createBassEngine } from "./bass";
import { createPianoEngine } from "./piano";
import { createGuitarEngine } from "./guitar";
import { createViolaoEngine } from "./violao";
import { createStringsEngine } from "./strings";
import { createViolinEngine } from "./violin";
import { createSaxEngine } from "./sax";
import { createAccordionEngine } from "./accordion";

const REGISTRY = new Map<string, EngineFactory>([
  ["drums", createDrumsEngine],
  ["bass", createBassEngine],
  ["piano", createPianoEngine],
  ["guitar", (sink) => createGuitarEngine(sink)],
  ["violao", createViolaoEngine],
  ["strings", createStringsEngine],
  ["violin", createViolinEngine],
  ["sax", createSaxEngine],
  ["accordion", createAccordionEngine],
]);

/** Plug a new instrument with one call (one file + this row is the norm). */
export function registerInstrument(id: string, factory: EngineFactory): void {
  if (REGISTRY.has(id)) throw new Error(`instrument already registered: ${id}`);
  REGISTRY.set(id, factory);
}

/** Remove a plugged instrument (tests/future packs). Canonical rows stay. */
export function unregisterInstrument(id: string): void {
  REGISTRY.delete(id);
}

export function registeredIds(): string[] {
  return [...REGISTRY.keys()];
}

/** The nine canonical ids, in band order. */
export function canonicalIds(): readonly string[] {
  return INSTRUMENTS;
}

/** Build the whole band around one sink per instrument. */
export function createBand(makeSink: (id: string) => VoiceSink): Record<string, InstrumentEngine> {
  const band: Record<string, InstrumentEngine> = {};
  for (const [id, factory] of REGISTRY) band[id] = factory(makeSink(id));
  return band;
}
