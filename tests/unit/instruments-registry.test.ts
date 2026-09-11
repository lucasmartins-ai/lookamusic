/**
 * Architecture acceptance (Phase 6): a new instrument plugs in via one file
 * + one registry row — no conductor/scheduler/mixer edits. The fictitious
 * kazoo proves it. Run: npm test -- instruments-registry
 */
import { afterEach, describe, expect, it } from "vitest";
import { INSTRUMENTS } from "@/domain/types";
import {
  canonicalIds,
  createBand,
  registeredIds,
  registerInstrument,
  unregisterInstrument,
} from "@/features/instruments/registry";
import { midiToFreq, type InstrumentEngine, type ScheduleContext } from "@/features/instruments/types";
import type { VoiceSink } from "@/features/instruments/audio-sink";
import { FakeSink } from "../helpers/fake-sink";
import { scheduleCtx } from "../helpers/passage";

afterEach(() => {
  unregisterInstrument("kazoo");
});

/** A whole new instrument in ~20 lines, touching only this file. */
function createKazooEngine(sink: VoiceSink): InstrumentEngine {
  return {
    // @ts-expect-error — fictitious id outside the canonical union, on purpose
    id: "kazoo",
    schedule(events, ctx: ScheduleContext) {
      for (const e of events) {
        if (e.instrument !== ("kazoo" as never)) continue;
        sink.tone({
          freq: midiToFreq(e.note.midi),
          at: ctx.audioTime + e.beat * (60 / ctx.tempo.playback),
          dur: 0.2,
          velocity: e.note.velocity,
          type: "square",
          attack: 0.01,
          release: 0.1,
          cutoff: 1500,
        });
      }
    },
    stop() {
      sink.cancel();
    },
    setVolume(v: number) {
      sink.setVolume(v);
    },
    setPan(p: number) {
      sink.setPan(p);
    },
  };
}

describe("canonical registry", () => {
  it("holds exactly the 8 canonical instruments", () => {
    expect(registeredIds().sort()).toEqual([...INSTRUMENTS].sort());
    expect(canonicalIds()).toEqual(INSTRUMENTS);
  });

  it("createBand builds all 8 with matching ids", () => {
    const band = createBand(() => new FakeSink());
    expect(Object.keys(band).sort()).toEqual([...INSTRUMENTS].sort());
    for (const id of INSTRUMENTS) expect(band[id]?.id).toBe(id);
  });
});

describe("plug-in without touching engines", () => {
  it("fictitious kazoo registers, voices, and unregisters cleanly", () => {
    registerInstrument("kazoo", createKazooEngine);
    expect(registeredIds()).toContain("kazoo");
    const sinks = new Map<string, FakeSink>();
    const band = createBand((id) => {
      const sink = new FakeSink();
      sinks.set(id, sink);
      return sink;
    });
    expect(band["kazoo"]).toBeDefined();
    const kazooSink = sinks.get("kazoo");
    expect(kazooSink?.calls).toBe(0);
    band["kazoo"]?.schedule(
      [
        {
          note: {
            id: "k1",
            pitch: 440,
            midi: 69,
            startTime: 0,
            duration: 0.2,
            velocity: 0.8,
            confidence: 1,
            source: "generated",
          },
          // @ts-expect-error — fictitious instrument id, on purpose
          instrument: "kazoo",
          bar: 0,
          beat: 0,
        },
      ],
      scheduleCtx(),
    );
    expect(kazooSink?.calls).toBe(1);
    band["kazoo"]?.stop();
    expect(kazooSink?.cancels).toBe(1);
  });

  it("duplicate registration throws (canonical rows are protected)", () => {
    expect(() => registerInstrument("piano", createKazooEngine)).toThrow(/already registered/);
  });

  it("unregister removes the plug-in; canonical band is intact", () => {
    registerInstrument("kazoo", createKazooEngine);
    unregisterInstrument("kazoo");
    expect(registeredIds().sort()).toEqual([...INSTRUMENTS].sort());
    expect(createBand(() => new FakeSink())["kazoo"]).toBeUndefined();
  });
});
