/**
 * Phase 17 — adaptive note stabilization (complements melody-stabilization):
 * 1. Vibrato beyond the hysteresis band must NOT change the note (weak confirm).
 * 2. A deliberate small step (1 semitone) must still confirm eventually.
 * 3. A steady, confident run locks the note: low-quality frames clear it.
 * 4. Locked notes get the extended small-excursion window.
 * 5. Locked notes get extra release slack for noisy breaths.
 * 6. Octave flicker never breaks a locked note.
 * Run: npm test -- melody-adaptive-stabilization
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import type { DomainEvents } from "@/domain/events";
import { NoteStabilizer } from "@/features/music/melody/stabilization";
import { config } from "@/lib/config";
import { G_4, smObs, smUnvoiced } from "../fixtures/melody";

function harness() {
  const bus = new EventBus();
  const stab = new NoteStabilizer(bus);
  const seen: { name: string; payload: unknown }[] = [];
  (["NoteStarted", "NoteChanged", "NoteEnded"] as const).forEach((name) =>
    bus.on(name, (p) => seen.push({ name, payload: p })),
  );
  return { stab, seen };
}

function names(seen: { name: string }[]): string[] {
  return seen.map((s) => s.name);
}

describe("Phase 17 — vibrato tolerance (weak confirmation)", () => {
  it("vibrato beyond the hysteresis band (±1.2 st) never changes the note", () => {
    const { stab, seen } = harness();
    // 1.2 st amplitude at 5.5 Hz: excursions cross the 1.0 st hysteresis
    // every half-cycle (~91 ms) but never persist the confirmation window.
    const periodMs = 1000 / 5.5;
    for (let t = 0; t <= 1200; t += 20) {
      const midi = G_4 + 1.2 * Math.sin((2 * Math.PI * t) / periodMs);
      stab.push(smObs(midi, t));
    }
    expect(names(seen)).toEqual(["NoteStarted"]);
    expect(stab.openNote()?.midi).toBe(G_4);
  });

  it("a deliberate 1-semitone step still confirms (not swallowed)", () => {
    const { stab, seen } = harness();
    for (let t = 0; t <= 200; t += 20) stab.push(smObs(G_4, t));
    for (let t = 220; t <= 900; t += 20) stab.push(smObs(G_4 + 1, t));
    // Legato step = new note (Ended + Started), never swallowed.
    expect(names(seen)).toEqual(["NoteStarted", "NoteEnded", "NoteStarted"]);
    expect((seen[2].payload as DomainEvents["NoteStarted"]).midi).toBe(G_4 + 1);
  });
});

describe("Phase 17 — adaptive lock", () => {
  it("steady confident singing locks the note and widens the small-excursion window", () => {
    const { stab, seen } = harness();
    for (let t = 0; t <= 600; t += 20) stab.push(smObs(G_4, t));
    const st = stab.status();
    expect(st.locked).toBe(true);
    expect(st.steadyMs).toBeGreaterThanOrEqual(config.note.adaptive.lockAfterMs);
    expect(st.weakConfirmMs).toBe(config.note.adaptive.weakConfirmMaxMs);

    // Excursion to G#4 (exactly 1 st) from 620 ms. Unlocked it would commit
    // at 620 + weakConfirmMs + stabilityMs; locked it needs weakConfirmMaxMs.
    const n = config.note;
    const unlockedCommit = 620 + n.weakConfirmMs + n.stabilityMs;
    const lockedCommit = 620 + n.adaptive.weakConfirmMaxMs + n.stabilityMs;
    expect(lockedCommit).toBeGreaterThan(unlockedCommit);
    for (let t = 620; t <= unlockedCommit; t += 20) stab.push(smObs(G_4 + 1, t));
    expect(seen.filter((s) => s.name === "NoteEnded")).toHaveLength(0);

    for (let t = unlockedCommit + 20; t <= lockedCommit + 200; t += 20) stab.push(smObs(G_4 + 1, t));
    expect(names(seen)).toEqual(["NoteStarted", "NoteEnded", "NoteStarted"]);
    expect(stab.openNote()?.midi).toBe(G_4 + 1);
  });

  it("low-confidence frames clear the lock (real noise is not trusted)", () => {
    const { stab } = harness();
    for (let t = 0; t <= 600; t += 20) stab.push(smObs(G_4, t));
    expect(stab.status().locked).toBe(true);
    stab.push(smObs(G_4, 620, 0.55)); // below lockConfidenceMin (0.6)
    expect(stab.status().locked).toBe(false);
    expect(stab.status().weakConfirmMs).toBe(config.note.weakConfirmMs);
  });
});

describe("Phase 17 — release & octave protection", () => {
  it("locked notes survive a breath longer than the base release window", () => {
    const { stab, seen } = harness();
    for (let t = 0; t <= 600; t += 20) stab.push(smObs(G_4, t));
    // A breath longer than the base close window (stability + release
    // extra) but shorter than the locked one (+ releaseExtraMaxMs).
    const n = config.note;
    const base = n.stabilityMs + n.releaseExtraMs;
    const locked = base + n.adaptive.releaseExtraMaxMs;
    const breath = locked - 20;
    expect(breath).toBeGreaterThanOrEqual(base);
    for (let t = 620; t < 620 + breath; t += 20) stab.push(smUnvoiced(t));
    expect(seen.filter((s) => s.name === "NoteEnded")).toHaveLength(0);
    expect(stab.openNote()).not.toBeNull();
    // Past the extended window it closes normally.
    for (let t = 620 + breath; t <= 620 + locked + 200; t += 20) stab.push(smUnvoiced(t));
    expect(seen.filter((s) => s.name === "NoteEnded")).toHaveLength(1);
  });

  it("intermittent octave flicker never breaks a locked note", () => {
    const { stab, seen } = harness();
    for (let t = 0; t <= 700; t += 20) stab.push(smObs(G_4, t)); // locks at 500
    expect(stab.status().locked).toBe(true);
    for (let t = 720; t <= 1400; t += 20) {
      stab.push(smObs(t % 40 === 0 ? G_4 + 12 : G_4, t));
    }
    expect(seen.filter((s) => s.name === "NoteChanged")).toHaveLength(0);
    expect(stab.openNote()?.midi).toBe(G_4);
  });
});
