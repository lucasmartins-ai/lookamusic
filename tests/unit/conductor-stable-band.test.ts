/**
 * Hotfix banda estável: a real-ish singer (vibrato ±40¢ @5.5 Hz, short
 * detector glitches, legato) through the WHOLE conductor. The band must
 * hold the harmony while the voice stays on a chord and move when the
 * melody clearly changes — not a new chord every bar.
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { midiToFreq } from "@/features/pitch/conversions";
import type { Chord, InstrumentId } from "@/domain/types";
import type { InstrumentEngine } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";

const IDS: InstrumentId[] = ["drums", "bass", "piano", "guitar", "violao", "strings", "violin", "sax", "accordion"];

function run(script: { midi: number; sec: number }[]): { bar: number; chord: Chord }[] {
  const events = new EventBus();
  const band = {} as Record<InstrumentId, InstrumentEngine>;
  for (const id of IDS) band[id] = { id, schedule() {}, stop() {}, setVolume() {}, setPan() {} };
  let now = 0;
  const c = new Conductor(createEngines(events), { band, schedulerNow: () => now, seed: "stable" }, events);
  c.reset(0);
  const chords: { bar: number; chord: Chord }[] = [];
  events.on("ChordChanged", (e) => chords.push({ bar: e.startBar, chord: e.chord }));
  const step = 0.02;
  let t = 0;
  let k = 0;
  for (const seg of script) {
    for (let s = 0; s < seg.sec; s += step, k++) {
      t += step;
      now = t;
      const glitch = k % 37 === 0 ? 3 : 0; // brief detector slip
      const cents = 40 * Math.sin(2 * Math.PI * 5.5 * t);
      const midi = seg.midi + glitch + cents / 100;
      c.pushObservation({ frequency: midiToFreq(midi), midiNote: midi, confidence: 0.9, clarity: 0.9, timestamp: t * 1000 });
      c.pushEnergy(0.2, t * 1000);
      if (k % 2 === 0) c.tick(t);
    }
  }
  // Legato singing must reach harmony as separate notes, not one open note.
  expect(c.state.melodyNotes().length).toBeGreaterThan(script.length / 2);
  c.dispose();
  return chords;
}

function changes(list: { chord: Chord }[]): number {
  let n = 0;
  for (let i = 1; i < list.length; i++) {
    if (list[i].chord.root !== list[i - 1].chord.root || list[i].chord.quality !== list[i - 1].chord.quality) n++;
  }
  return n;
}

describe("conductor: stable band over a wobbly voice", () => {
  it("holding C–E–G for ~16 s keeps one chord (C major)", () => {
    const script = Array.from({ length: 8 }, (_, i) => ({ midi: [60, 64, 67, 64][i % 4], sec: 2 }));
    const chords = run(script);
    expect(chords.length).toBeGreaterThan(4);
    expect(changes(chords.slice(1))).toBeLessThanOrEqual(1);
    expect(chords[chords.length - 1].chord).toMatchObject({ root: 0, quality: "major" });
  });

  it("moving to G–B–D for a few bars moves the band to G", () => {
    const script = [
      ...Array.from({ length: 4 }, (_, i) => ({ midi: [60, 64, 67, 64][i], sec: 2 })),
      ...Array.from({ length: 4 }, (_, i) => ({ midi: [67, 71, 74, 71][i], sec: 2 })),
    ];
    const chords = run(script);
    expect(chords[chords.length - 1].chord.root).toBe(7);
  });
});
