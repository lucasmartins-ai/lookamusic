/**
 * Behavioral contracts per instrument (Phase 6, §23): bass roots+fifths,
 * piano voicings in range, drums never pitch, violin boundary entries,
 * sax mid-energy+ fills, strings pads, guitar strums, accordion sustain.
 * Run: npm test -- instruments-musical
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { PitchClass } from "@/domain/types";
import type { DrumVoice } from "@/features/music/rhythm/patterns";
import { chordTones } from "@/features/music/theory/chords";
import { planBassBar } from "@/features/instruments/bass";
import { planPianoBar } from "@/features/instruments/piano";
import { planGuitarBar } from "@/features/instruments/guitar";
import { planViolaoBar } from "@/features/instruments/violao";
import { planStringsBar } from "@/features/instruments/strings";
import { planViolinBar } from "@/features/instruments/violin";
import { planSaxBar } from "@/features/instruments/sax";
import { planAccordionBar } from "@/features/instruments/accordion";
import { planDrumsBar } from "@/features/instruments/drums";
import { anon, demoPassage } from "../helpers/passage";

const C_MAJOR = { root: 0 as const, quality: "major" as const };

describe("bass: roots + fifths, phrase-anchored", () => {
  it("C major bar voices C2 root then G2 fifth", () => {
    const events = planBassBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [] }), 1);
    expect(events.map((e) => e.note.midi)).toEqual([36, 43]);
    expect(events.map((e) => e.beat)).toEqual([0, 2]);
  });

  it("phrase-start downbeat hits harder than a mid-phrase one", () => {
    const start = planBassBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [0] }), 2);
    const mid = planBassBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [] }), 2);
    expect(start[0].note.velocity).toBeGreaterThan(mid[0].note.velocity);
  });
});

describe("piano: harmony voicings, broken chords", () => {
  it("arpeggiates chord tones inside the voicing range", () => {
    const events = planPianoBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [] }), 1);
    expect(events.length).toBe(4); // one broken-chord note per quarter
    const pcs = new Set(events.map((e) => e.note.midi % 12));
    expect(pcs).toEqual(new Set(chordTones(C_MAJOR)));
    for (const e of events) {
      expect(e.note.midi).toBeGreaterThanOrEqual(config.harmony.voicingMinMidi);
      expect(e.note.midi).toBeLessThanOrEqual(config.harmony.voicingMaxMidi);
    }
  });
});

describe("guitar: strum + arpeggiate", () => {
  it("strums are time-ordered with sub-beat string steps, all chord tones", () => {
    const events = planGuitarBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [] }), 1);
    const allowed = new Set(chordTones(C_MAJOR));
    for (const e of events) {
      expect(allowed.has((e.note.midi % 12) as PitchClass)).toBe(true);
    }
    for (let i = 1; i < events.length; i++) {
      expect(events[i].beat).toBeGreaterThanOrEqual(events[i - 1].beat);
    }
    const strum = events.filter((e) => e.beat < 1);
    expect(strum.length).toBeGreaterThanOrEqual(4); // full chord across the strings
    expect(strum[strum.length - 1].beat - strum[0].beat).toBeLessThan(0.5);
  });
});

describe("violao: fingerpick dedilhado, sem strum duplo", () => {
  it("dedilha baixo + arpejo com tons do acorde, ordenado no tempo", () => {
    const events = planViolaoBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [] }), 1);
    expect(events.length).toBeGreaterThanOrEqual(4);
    const allowed = new Set(chordTones(C_MAJOR));
    for (const e of events) {
      expect(e.instrument).toBe("violao");
      expect(allowed.has((e.note.midi % 12) as PitchClass)).toBe(true);
    }
    for (let i = 1; i < events.length; i++) {
      expect(events[i].beat).toBeGreaterThanOrEqual(events[i - 1].beat);
    }
    // Calmo (energia 0.7 → semínimas): primeiro ataque é o baixo do acorde.
    expect(events[0].beat).toBe(0);
    expect(events[0].note.midi % 12).toBe(C_MAJOR.root);
  });

  it("energia alta adensa o dedilhado sem sair do compasso", () => {
    const calm = planViolaoBar(demoPassage({ chords: [C_MAJOR], energy01: 0.3 }), 1);
    const busy = planViolaoBar(demoPassage({ chords: [C_MAJOR], energy01: 0.9 }), 1);
    expect(busy.length).toBeGreaterThan(calm.length);
    for (const e of busy) expect(e.beat).toBeLessThan(4);
  });
});

describe("piano calmo: half-notes sustentadas em baixa energia", () => {
  it("energia baixa segura o acorde (2 ataques), energia alta corre o broken-chord", () => {
    const calm = planPianoBar(demoPassage({ chords: [C_MAJOR], energy01: 0.2 }), 1);
    expect(calm.filter((e) => e.beat === 0)).toHaveLength(3); // tríade
    expect(new Set(calm.map((e) => e.beat)).size).toBe(2); // 2 ataques
    const busy = planPianoBar(demoPassage({ chords: [C_MAJOR], energy01: 0.7 }), 1);
    expect(busy.length).toBe(4);
  });
});

describe("strings: sustained pads swelling with energy", () => {
  it("holds whole-bar triads; louder energy → louder pad", () => {
    const barSec = (4 * 60) / 96;
    const soft = planStringsBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [], energy01: 0.2 }), 1);
    const loud = planStringsBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [], energy01: 0.9 }), 1);
    expect(soft.length).toBe(3);
    for (const e of soft) expect(e.note.duration).toBeCloseTo(barSec, 9);
    for (let i = 0; i < soft.length; i++) {
      expect(loud[i].note.velocity).toBeGreaterThan(soft[i].note.velocity);
    }
  });
});

describe("violin: boundary entries only", () => {
  it("silent on non-boundary bars, doubles melody on phrase starts", () => {
    const silent = planViolinBar(demoPassage({ phraseStarts: [99] }), 1);
    expect(silent).toEqual([]);
    const entry = planViolinBar(demoPassage({ phraseStarts: [0] }), 1);
    expect(entry.length).toBeGreaterThan(0);
    // Doubling preserves the sung pitches.
    const sung = new Set(demoPassage().melody.map((m) => Math.round(m.midi)));
    for (const e of entry) expect(sung.has(e.note.midi)).toBe(true);
  });
});

describe("sax: fills at mid-energy+", () => {
  it("silent below the floor, last-beat fill above it", () => {
    const quiet = planSaxBar(demoPassage({ energy01: 0.2 }), 1);
    expect(quiet).toEqual([]);
    const fill = planSaxBar(demoPassage({ energy01: 0.8 }), 1);
    expect(fill.length).toBeGreaterThan(0);
    for (const e of fill) {
      expect(e.beat).toBeGreaterThanOrEqual(3); // 4/4 last beat
      expect(e.beat).toBeLessThan(4);
    }
  });
});

describe("accordion: chordal sustain with bellows pulse", () => {
  it("re-articulates the triad on every beat", () => {
    const events = planAccordionBar(demoPassage({ chords: [C_MAJOR], phraseStarts: [] }), 1);
    expect(events.length).toBe(4 * 3);
    const allowed = new Set(chordTones(C_MAJOR));
    for (const e of events) expect(allowed.has((e.note.midi % 12) as PitchClass)).toBe(true);
  });
});

describe("drums: meter + energy, never pitch", () => {
  it("GM map covers every drum voice with distinct codes", () => {
    const gm = config.instruments.drumGm;
    const voices = ["kick", "snare", "hihat", "ride", "crash", "tom", "rim", "clap", "shaker", "cajon", "cajon-slap"] as DrumVoice[];
    const codes = voices.map((v) => gm[v] as number);
    expect(new Set(codes).size).toBe(voices.length);
  });

  it("different melodies AND different chords → identical drums", () => {
    const base = demoPassage();
    const other = demoPassage({
      chords: [{ root: 9, quality: "min7" }],
      melody: base.melody.map((m) => ({ ...m, midi: m.midi + 7, pitch: m.pitch * 1.5 })),
    });
    expect(anon(planDrumsBar(other, 2))).toEqual(anon(planDrumsBar(base, 2)));
  });

  it("downbeat present in every meter", () => {
    for (const meter of [
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
      { numerator: 6, denominator: 8 },
    ] as const) {
      const events = planDrumsBar(demoPassage({ meter }), 2);
      for (const bar of [0, 1]) {
        const down = events.filter((e) => e.bar === bar && e.beat === 0);
        expect(down.length).toBeGreaterThan(0);
      }
    }
  });
});
