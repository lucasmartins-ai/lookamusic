/**
 * Engine contract (Phase 6, §23): every motor implements the interface,
 * `stop()` silences, volume/pan clamp to limits. Run:
 * npm test -- instruments-contract
 */
import { describe, expect, it } from "vitest";
import { INSTRUMENTS, type InstrumentId } from "@/domain/types";
import type { InstrumentEngine } from "@/features/instruments/types";
import type { VoiceSink } from "@/features/instruments/audio-sink";
import { createDrumsEngine, planDrumsBar } from "@/features/instruments/drums";
import { createBassEngine, planBassBar } from "@/features/instruments/bass";
import { createPianoEngine, planPianoBar } from "@/features/instruments/piano";
import { createGuitarEngine, planGuitarBar } from "@/features/instruments/guitar";
import { createViolaoEngine, planViolaoBar } from "@/features/instruments/violao";
import { createStringsEngine, planStringsBar } from "@/features/instruments/strings";
import { createViolinEngine, planViolinBar } from "@/features/instruments/violin";
import { createSaxEngine, planSaxBar } from "@/features/instruments/sax";
import { createAccordionEngine, planAccordionBar } from "@/features/instruments/accordion";
import { FakeSink } from "../helpers/fake-sink";
import { demoPassage, scheduleCtx } from "../helpers/passage";

type Factory = (sink: VoiceSink) => InstrumentEngine;

const ENGINES: { id: InstrumentId; factory: Factory }[] = [
  { id: "drums", factory: createDrumsEngine },
  { id: "bass", factory: createBassEngine },
  { id: "piano", factory: createPianoEngine },
  { id: "guitar", factory: (s) => createGuitarEngine(s) },
  { id: "violao", factory: createViolaoEngine },
  { id: "strings", factory: createStringsEngine },
  { id: "violin", factory: createViolinEngine },
  { id: "sax", factory: createSaxEngine },
  { id: "accordion", factory: createAccordionEngine },
];

const PLANS = {
  drums: planDrumsBar,
  bass: planBassBar,
  piano: planPianoBar,
  guitar: planGuitarBar,
  violao: planViolaoBar,
  strings: planStringsBar,
  violin: planViolinBar,
  sax: planSaxBar,
  accordion: planAccordionBar,
} as const;

describe("contract: interface shape", () => {
  it("covers exactly the 9 canonical instruments", () => {
    expect(ENGINES.map((e) => e.id).sort()).toEqual([...INSTRUMENTS].sort());
  });

  for (const { id, factory } of ENGINES) {
    it(`${id} exposes id + schedule/stop/setVolume/setPan`, () => {
      const engine = factory(new FakeSink());
      expect(engine.id).toBe(id);
      expect(typeof engine.schedule).toBe("function");
      expect(typeof engine.stop).toBe("function");
      expect(typeof engine.setVolume).toBe("function");
      expect(typeof engine.setPan).toBe("function");
    });
  }
});

describe("contract: stop() silences", () => {
  for (const { id, factory } of ENGINES) {
    it(`${id}.stop() cancels the sink (with and without all=true)`, () => {
      const sink = new FakeSink();
      const engine = factory(sink);
      engine.schedule(PLANS[id](demoPassage(), 1), scheduleCtx());
      expect(sink.calls).toBeGreaterThan(0);
      engine.stop();
      expect(sink.cancels).toBe(1);
      engine.stop(true);
      expect(sink.cancels).toBe(2);
    });
  }
});

describe("contract: volume/pan limits", () => {
  for (const { id, factory } of ENGINES) {
    it(`${id} clamps volume 0–1 and pan -1–1 (NaN → 0)`, () => {
      const sink = new FakeSink();
      const engine = factory(sink);
      engine.setVolume(-0.5);
      engine.setVolume(1.5);
      engine.setVolume(Number.NaN);
      expect(sink.volumes).toEqual([0, 1, 0]);
      engine.setPan(-2);
      engine.setPan(2);
      engine.setPan(Number.NaN);
      expect(sink.pans).toEqual([-1, 1, 0]);
      engine.setVolume(0.7);
      engine.setPan(-0.3);
      expect(sink.volumes.at(-1)).toBeCloseTo(0.7, 9);
      expect(sink.pans.at(-1)).toBeCloseTo(-0.3, 9);
    });
  }
});

describe("contract: schedule() voices own events only", () => {
  for (const { id, factory } of ENGINES) {
    it(`${id} renders its events and ignores other instruments'`, () => {
      const sink = new FakeSink();
      const engine = factory(sink);
      const own = PLANS[id](demoPassage(), 1);
      expect(own.length).toBeGreaterThan(0);
      engine.schedule(own, scheduleCtx());
      const ownCalls = sink.calls;
      expect(ownCalls).toBeGreaterThan(0);
      // Another instrument's material is silently skipped, never voiced.
      const other = PLANS[id === "piano" ? "bass" : "piano"](demoPassage(), 1);
      expect(other.length).toBeGreaterThan(0);
      engine.schedule(other, scheduleCtx());
      expect(sink.calls).toBe(ownCalls);
    });

    it(`${id} never throws on malformed input`, () => {
      const sink = new FakeSink();
      const engine = factory(sink);
      expect(() =>
        engine.schedule(
          // @ts-expect-error — hostile input probe
          [null, undefined, {}, { note: null, instrument: id, bar: 0, beat: 0 }],
          scheduleCtx(),
        ),
      ).not.toThrow();
    });
  }

  it("electric guitar variant renders with the brighter timbre", () => {
    const sink = new FakeSink();
    const engine = createGuitarEngine(sink, { electric: true });
    engine.schedule(planGuitarBar(demoPassage(), 1), scheduleCtx());
    expect(sink.calls).toBeGreaterThan(0);
    const cutoff = sink.tones[0]?.cutoff;
    expect(cutoff).toBeGreaterThan(3000);
  });
});
