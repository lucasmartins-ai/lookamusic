/**
 * Arbitrary subsets render without error (Phase 6 acceptance): the same
 * passage voices identically whether the full band or a subset plays.
 * Run: npm test -- instruments-combinations
 */
import { describe, expect, it } from "vitest";
import type { InstrumentId } from "@/domain/types";
import { createBand } from "@/features/instruments/registry";
import type { MusicalEvent } from "@/features/instruments/types";
import { planDrumsBar } from "@/features/instruments/drums";
import { planBassBar } from "@/features/instruments/bass";
import { planPianoBar } from "@/features/instruments/piano";
import { planGuitarBar } from "@/features/instruments/guitar";
import { planViolaoBar } from "@/features/instruments/violao";
import { planStringsBar } from "@/features/instruments/strings";
import { planViolinBar } from "@/features/instruments/violin";
import { planSaxBar } from "@/features/instruments/sax";
import { planAccordionBar } from "@/features/instruments/accordion";
import { FakeSink } from "../helpers/fake-sink";
import { anon, demoPassage, scheduleCtx } from "../helpers/passage";

const PLANS: Record<InstrumentId, (bars: number) => MusicalEvent[]> = {
  drums: (b) => planDrumsBar(demoPassage(), b),
  bass: (b) => planBassBar(demoPassage(), b),
  piano: (b) => planPianoBar(demoPassage(), b),
  guitar: (b) => planGuitarBar(demoPassage(), b),
  violao: (b) => planViolaoBar(demoPassage(), b),
  strings: (b) => planStringsBar(demoPassage(), b),
  violin: (b) => planViolinBar(demoPassage(), b),
  sax: (b) => planSaxBar(demoPassage(), b),
  accordion: (b) => planAccordionBar(demoPassage(), b),
};

const COMBINATIONS: InstrumentId[][] = [
  [],
  ["drums"],
  ["bass"],
  ["piano"],
  ["guitar"],
  ["violao"],
  ["strings"],
  ["violin"],
  ["sax"],
  ["accordion"],
  ["drums", "bass"],
  ["piano", "bass", "drums"],
  ["guitar", "strings"],
  ["guitar", "violao"],
  ["violin", "sax", "accordion"],
  ["drums", "bass", "piano", "guitar", "violao", "strings", "violin", "sax", "accordion"],
];

describe("combination table: every subset renders without error", () => {
  for (const combo of COMBINATIONS) {
    it(`[${combo.join("+") || "silence"}] plans + schedules cleanly`, () => {
      const sinks = new Map<InstrumentId, FakeSink>();
      const band = createBand((id) => {
        const sink = new FakeSink();
        sinks.set(id as InstrumentId, sink);
        return sink;
      });
      const ctx = scheduleCtx();
      expect(() => {
        for (const id of combo) {
          band[id]?.schedule(PLANS[id](2), ctx);
        }
      }).not.toThrow();
      for (const id of combo) {
        expect(sinks.get(id)?.calls ?? 0).toBeGreaterThan(0);
      }
      band[combo[0] ?? "drums"]?.stop();
    });
  }
});

describe("same composition, any combination", () => {
  it("per-engine voicing is identical in subset vs full band", () => {
    const render = (combo: InstrumentId[]) => {
      const sinks = new Map<InstrumentId, FakeSink>();
      const band = createBand((id) => {
        const sink = new FakeSink();
        sinks.set(id as InstrumentId, sink);
        return sink;
      });
      const ctx = scheduleCtx();
      for (const id of combo) band[id]?.schedule(PLANS[id](2), ctx);
      return sinks;
    };
    const full = render(["drums", "bass", "piano", "guitar", "violao", "strings", "violin", "sax", "accordion"]);
    const subset = render(["drums", "bass"]);
    for (const id of ["drums", "bass"] as InstrumentId[]) {
      expect(subset.get(id)?.tones).toEqual(full.get(id)?.tones);
      expect(subset.get(id)?.noises).toEqual(full.get(id)?.noises);
    }
  });

  it("planning is deterministic: same passage → same events twice", () => {
    for (const id of Object.keys(PLANS) as InstrumentId[]) {
      expect(anon(PLANS[id](2))).toEqual(anon(PLANS[id](2)));
    }
  });
});
