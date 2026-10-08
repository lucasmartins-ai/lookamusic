/**
 * NoteStabilizer: hysteresis + min-duration → NoteStarted/Changed/Ended
 * (Phase 2, §9–10). Includes the §9 fixture: G4 with vibrato and single-
 * frame G#4/F#4 excursions must remain one stable G4.
 * Run: npm test -- melody-stabilization
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import type { DomainEvents } from "@/domain/events";
import { NoteStabilizer } from "@/features/music/melody/stabilization";
import { config } from "@/lib/config";
import { A_4, G_4, G_SHARP_4, F_SHARP_4, feed, smObs, smUnvoiced } from "../fixtures/melody";

function harness() {
  const bus = new EventBus();
  const stab = new NoteStabilizer(bus);
  const seen: { name: string; payload: unknown }[] = [];
  (["NoteStarted", "NoteChanged", "NoteEnded"] as const).forEach((name) =>
    bus.on(name, (p) => seen.push({ name, payload: p })),
  );
  return { bus, stab, seen };
}

function names(seen: { name: string }[]): string[] {
  return seen.map((s) => s.name);
}

describe("§9 fixture: G4 + vibrato + G#4/F#4 blips stays G4", () => {
  it("emits exactly one NoteStarted(G4), nothing else", () => {
    const { stab, seen } = harness();
    const seq: (number | null)[] = [
      G_4, G_4, G_4, // attack
      66.8, 67.2, 66.9, 67.1, // vibrato edge
      G_4, // 140
      G_SHARP_4, // 160: one-frame excursion
      G_4, // 180
      F_SHARP_4, // 200: one-frame excursion
      G_4, G_4, G_4, G_4, G_4, G_4, G_4, // 220–340 sustain
    ];
    seq.forEach((m, i) => stab.push(smObs(m!, i * 20)));
    expect(names(seen)).toEqual(["NoteStarted"]);
    const started = seen[0].payload as DomainEvents["NoteStarted"];
    expect(started.midi).toBe(G_4);
    expect(started.startTime).toBe(0); // backdated to the true onset
    expect(stab.openNote()?.midi).toBe(G_4);
  });
});

describe("minimum duration", () => {
  it("ignores blips shorter than stabilityMs", () => {
    const { stab, seen } = harness();
    // Shorter than stabilityMs (TDR-22: 40 ms) → nothing; longer → a note.
    const S = config.note.stabilityMs;
    feed((t) => stab.push(smObs(G_4, t)), 0, S - 20);
    expect(seen).toEqual([]);
    feed((t) => stab.push(smObs(G_4, t)), S, S + 80);
    expect(names(seen)).toEqual(["NoteStarted"]);
  });

  it("drops an attack interrupted by silence", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, config.note.stabilityMs - 20);
    feed((t) => stab.push(smUnvoiced(t)), config.note.stabilityMs, 400);
    expect(seen).toEqual([]);
  });
});

describe("hysteresis", () => {
  it("absorbs drift inside the hysteresis band", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 200);
    expect(names(seen)).toEqual(["NoteStarted"]);
    feed((t) => stab.push(smObs(67.4, t)), 220, 420); // +0.4 st < 0.6
    expect(names(seen)).toEqual(["NoteStarted"]);
    expect(stab.openNote()?.midi).toBe(G_4);
  });

  it("legato step under continuous voicing = new note, seamless (no gap)", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 200);
    feed((t) => stab.push(smObs(A_4, t)), 220, 420);
    expect(names(seen)).toEqual(["NoteStarted", "NoteEnded", "NoteStarted"]);
    const first = seen[0].payload as DomainEvents["NoteStarted"];
    const ended = seen[1].payload as DomainEvents["NoteEnded"];
    const second = seen[2].payload as DomainEvents["NoteStarted"];
    expect(second.midi).toBe(A_4);
    // The old note ends exactly where the new pitch began.
    expect(first.startTime + ended.duration).toBeCloseTo(second.startTime, 6);
  });

  it("re-articulates (Ended + Started) after any unvoiced gap", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 200);
    feed((t) => stab.push(smUnvoiced(t)), 220, 260); // 3 frames: gap, no close
    expect(names(seen)).toEqual(["NoteStarted"]);
    feed((t) => stab.push(smObs(A_4, t)), 280, 480);
    expect(names(seen)).toEqual(["NoteStarted", "NoteEnded", "NoteStarted"]);
    const second = seen[2].payload as DomainEvents["NoteStarted"];
    expect(second.midi).toBe(A_4);
    expect(second.id).not.toBe((seen[0].payload as DomainEvents["NoteStarted"]).id);
  });
});

describe("note endings", () => {
  it("closes after sustained silence with exact voiced duration", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 300);
    feed((t) => stab.push(smUnvoiced(t)), 320, 600);
    expect(names(seen)).toEqual(["NoteStarted", "NoteEnded"]);
    const ended = seen[1].payload as DomainEvents["NoteEnded"];
    expect(ended.duration).toBeCloseTo(0.3, 2);
    const done = stab.completedNotes();
    expect(done).toHaveLength(1);
    expect(done[0].duration).toBeGreaterThan(0);
    expect(done[0].startTime).toBe(0);
  });

  it("survives a two-frame dropout without splitting", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 200);
    stab.push(smUnvoiced(220));
    stab.push(smUnvoiced(240));
    feed((t) => stab.push(smObs(G_4, t)), 260, 500);
    expect(names(seen)).toEqual(["NoteStarted"]);
  });
});

describe("hotfix voz estável: confirmação + trava de oitava + release", () => {
  it("alternância rápida G4↔G#4 nunca troca a nota aberta", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 200);
    expect(names(seen)).toEqual(["NoteStarted"]);
    for (let t = 220; t <= 620; t += 20) {
      stab.push(smObs(t % 40 === 20 ? G_SHARP_4 : G_4, t));
    }
    expect(names(seen)).toEqual(["NoteStarted"]);
    expect(stab.openNote()?.midi).toBe(G_4);
  });

  it("flicker de oitava G4↔G5 intermitente não quebra a nota", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 200);
    for (let t = 220; t <= 620; t += 20) {
      stab.push(smObs(t % 40 === 20 ? G_4 + 12 : G_4, t));
    }
    expect(names(seen)).toEqual(["NoteStarted"]);
    expect(stab.openNote()?.midi).toBe(G_4);
  });

  it("salto de oitava sustentado confirma (com atraso) via legato", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 200);
    feed((t) => stab.push(smObs(G_4 + 12, t)), 220, 700);
    expect(names(seen)).toEqual(["NoteStarted", "NoteEnded", "NoteStarted"]);
    expect((seen[2].payload as DomainEvents["NoteStarted"]).midi).toBe(G_4 + 12);
  });

  it("gap curto de oclusiva não fecha a nota (release estendido)", () => {
    const { stab, seen } = harness();
    // Gap 20 ms shorter than the close window (stability + release extra).
    const gap = config.note.stabilityMs + config.note.releaseExtraMs - 20;
    feed((t) => stab.push(smObs(G_4, t)), 0, 300);
    feed((t) => stab.push(smUnvoiced(t)), 320, 320 + gap - 20);
    feed((t) => stab.push(smObs(G_4, t)), 320 + gap, 600 + gap);
    expect(names(seen)).toEqual(["NoteStarted"]);
  });
});

describe("integration: synthetic observations → ordered NoteEvents", () => {
  it("completes two notes sorted in time with unique ids", () => {
    const { stab, seen } = harness();
    feed((t) => stab.push(smObs(G_4, t)), 0, 300);
    feed((t) => stab.push(smUnvoiced(t)), 320, 600); // closes G4
    feed((t) => stab.push(smObs(A_4, t)), 620, 920);
    feed((t) => stab.push(smUnvoiced(t)), 940, 1300); // closes A4
    expect(names(seen)).toEqual(["NoteStarted", "NoteEnded", "NoteStarted", "NoteEnded"]);
    const done = stab.completedNotes();
    expect(done).toHaveLength(2);
    expect(done[0].startTime).toBeLessThan(done[1].startTime);
    expect(done.map((n) => n.midi)).toEqual([G_4, A_4]);
    expect(new Set(done.map((n) => n.id)).size).toBe(2);
    for (const n of done) {
      expect(n.duration).toBeGreaterThan(0);
      expect(n.source).toBe("voice");
    }
  });
});
