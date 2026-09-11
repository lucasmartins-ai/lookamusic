/**
 * Pure musical planners (Phase 6, §23). No React, no Web Audio.
 * Each `planX` renders the same passage for one instrument as
 * `MusicalEvent[]` — the "same composition renders on any combination"
 * guarantee is structural: planners share one `PassageInput`, engines only
 * voice it. All thresholds/tunables come from `config.instruments`.
 */
import { config } from "@/lib/config";
import type {
  Chord,
  InstrumentId,
  NoteEvent,
  TimeSignature,
} from "@/domain/types";
import { chordTones } from "@/features/music/theory/chords";
import { voicingCandidates } from "@/features/music/harmony/voice-leading";
import {
  renderAccompaniment,
  type DrumStyleId,
} from "@/features/music/rhythm/patterns";
import { barEighths } from "@/features/music/rhythm/meter";
import { midiToFreq, type MusicalEvent } from "./types";

export interface PassageInput {
  /** One chord per bar; bar i uses chords[min(i, len-1)]. Non-empty. */
  chords: Chord[];
  /** Melody in transport seconds (violin doubling reads this). */
  melody: NoteEvent[];
  /** Phrase-boundary times in transport seconds (violin entries). */
  phraseStarts: number[];
  meter: TimeSignature;
  /** Playback BPM clock (scheduler clock). */
  bpm: number;
  /** Transport time of bar 0, beat 0. */
  originSec: number;
  /** 0–1 normalized intensity. */
  energy01: number;
  /** 0–1 onset density. */
  density: number;
  /** Drums only. */
  style?: DrumStyleId;
}

/** Quarter-note beats in one bar of `meter` (6/8 counts 3 quarters). */
export function barQuarters(meter: TimeSignature): number {
  return barEighths(meter) / 2;
}

function secPerQuarter(bpm: number): number {
  const b = Number.isFinite(bpm) && bpm > 0 ? bpm : 90;
  return 60 / b;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Louder singing hits harder, quiet singing stays audible (floor). */
function vel(base: number, energy01: number): number {
  const e = clamp01(energy01);
  const floor = config.rhythm.energyVelocityFloor;
  return clamp01(base * (floor + (1 - floor) * e));
}

let planSeq = 0;

function note(
  instrument: InstrumentId,
  bar: number,
  beat: number,
  midi: number,
  startSec: number,
  durSec: number,
  velocity: number,
): MusicalEvent {
  const m = Math.max(0, Math.min(127, Math.round(midi)));
  planSeq += 1;
  return {
    note: {
      id: `f6-${instrument}-b${bar}-${planSeq}`,
      pitch: midiToFreq(m),
      midi: m,
      startTime: startSec,
      duration: Math.max(0, durSec),
      velocity: clamp01(velocity),
      confidence: 1,
      source: "generated",
    },
    instrument,
    bar,
    beat,
  };
}

function barStartSec(input: PassageInput, bar: number): number {
  return input.originSec + bar * barQuarters(input.meter) * secPerQuarter(input.bpm);
}

function chordAt(input: PassageInput, bar: number): Chord {
  return input.chords[Math.min(bar, input.chords.length - 1)];
}

/** True when a phrase boundary lands on this bar's downbeat (±half a beat). */
export function isPhraseStartBar(input: PassageInput, bar: number): boolean {
  const start = barStartSec(input, bar);
  const tol = secPerQuarter(input.bpm) / 2;
  return input.phraseStarts.some((p) => Math.abs(p - start) <= tol);
}

/** Bass MIDI for a pitch class near the configured octave center. */
export function bassMidiFor(rootPc: number): number {
  const center = config.instruments.bassRootMidi;
  const delta = (((rootPc - (center % 12)) % 12) + 12) % 12;
  return center + delta;
}

/**
 * Drums: meter + energy from the rhythm engine, never pitch. The planner
 * input carries no melody field read — pitch-independence is structural.
 */
export function planDrums(input: PassageInput, bars: number): MusicalEvent[] {
  const style = input.style ?? "acoustic-pop";
  const gm = config.instruments.drumGm;
  const out: MusicalEvent[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const hits = renderAccompaniment(
      {
        tempo: { estimated: input.bpm, target: input.bpm, playback: input.bpm, confidence: 1 },
        meter: input.meter,
        density: input.density,
        energy01: input.energy01,
      },
      style,
    );
    const start = barStartSec(input, bar);
    const spq = secPerQuarter(input.bpm);
    for (const h of hits) {
      const midi = gm[h.voice] as number;
      out.push(
        note("drums", bar, h.timeQuarters, midi, start + h.timeQuarters * spq, 0.05, h.velocity),
      );
    }
  }
  return out;
}

/** Bass: roots + fifths, phrase-anchored (accented root on boundaries). */
export function planBass(input: PassageInput, bars: number): MusicalEvent[] {
  const out: MusicalEvent[] = [];
  const barQ = barQuarters(input.meter);
  const half = barQ / 2;
  const spq = secPerQuarter(input.bpm);
  for (let bar = 0; bar < bars; bar++) {
    const chord = chordAt(input, bar);
    const root = bassMidiFor(chord.root);
    const fifth = root + 7;
    const start = barStartSec(input, bar);
    const accent = isPhraseStartBar(input, bar) ? 1 : 0.85;
    out.push(note("bass", bar, 0, root, start, half * spq * 0.9, vel(accent, input.energy01)));
    out.push(
      note("bass", bar, half, fifth, start + half * spq, (barQ - half) * spq * 0.9, vel(0.75, input.energy01)),
    );
  }
  return out;
}

/** Piano: close-position voicings as broken-chord quarter notes. */
export function planPiano(input: PassageInput, bars: number): MusicalEvent[] {
  const out: MusicalEvent[] = [];
  const barQ = barQuarters(input.meter);
  const spq = secPerQuarter(input.bpm);
  for (let bar = 0; bar < bars; bar++) {
    const chord = chordAt(input, bar);
    const [v0, v1, v2] = voicingCandidates(chord)[0] ?? [48, 52, 55];
    const voices = [v0, v1, v2];
    const start = barStartSec(input, bar);
    for (let q = 0; q < Math.floor(barQ); q++) {
      const midi = voices[q % 3];
      out.push(
        note("piano", bar, q, midi, start + q * spq, spq * 0.9, vel(0.7, input.energy01)),
      );
    }
  }
  return out;
}

function guitarMidis(chord: Chord): number[] {
  const tones = chordTones(chord);
  const rootPc = chord.root;
  const base = 48 + (((rootPc - (48 % 12)) % 12) + 12) % 12;
  const midis = tones.map((pc) => {
    const delta = (((pc - (base % 12)) % 12) + 12) % 12;
    return base + delta;
  });
  midis.sort((a, b) => a - b);
  midis.push(midis[0] + 12);
  return midis;
}

/** Guitar: strummed attacks + arpeggiated tail (acoustic voicing). */
export function planGuitar(input: PassageInput, bars: number): MusicalEvent[] {
  const out: MusicalEvent[] = [];
  const barQ = barQuarters(input.meter);
  const spq = secPerQuarter(input.bpm);
  const stepQ = config.instruments.guitarStrumStepSec / spq;
  const strumBeats = barQ >= 4 ? [0, barQ / 2] : [0];
  for (let bar = 0; bar < bars; bar++) {
    const strings = guitarMidis(chordAt(input, bar));
    const start = barStartSec(input, bar);
    for (const sb of strumBeats) {
      strings.forEach((midi, k) => {
        const beat = sb + k * stepQ;
        out.push(
          note("guitar", bar, beat, midi, start + beat * spq, spq * 0.8, vel(0.72, input.energy01)),
        );
      });
    }
    for (let q = Math.ceil(barQ / 2) + (barQ >= 4 ? 0 : 1); q < Math.floor(barQ); q++) {
      if (strumBeats.includes(q)) continue;
      const midi = strings[q % strings.length];
      out.push(
        note("guitar", bar, q, midi, start + q * spq, spq * 0.7, vel(0.55, input.energy01)),
      );
    }
  }
  out.sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  return out;
}

/** Strings: sustained whole-bar pads, swelling with energy. */
export function planStrings(input: PassageInput, bars: number): MusicalEvent[] {
  const out: MusicalEvent[] = [];
  const barQ = barQuarters(input.meter);
  const spq = secPerQuarter(input.bpm);
  for (let bar = 0; bar < bars; bar++) {
    const tones = chordTones(chordAt(input, bar));
    const rootPc = chordAt(input, bar).root;
    const base = 48 + (((rootPc - (48 % 12)) % 12) + 12) % 12;
    const midis = tones.map((pc) => base + ((((pc - (base % 12)) % 12) + 12) % 12));
    const start = barStartSec(input, bar);
    for (const midi of midis) {
      // Pad swells with energy via the shared velocity curve (floor → full).
      out.push(note("strings", bar, 0, midi, start, barQ * spq, vel(0.55, input.energy01)));
    }
  }
  return out;
}

/**
 * Violin: lead doubling, enters on phrase boundaries only. Non-boundary
 * bars render silence — arrangement cues (Phase 7) drive the entries.
 */
export function planViolin(input: PassageInput, bars: number): MusicalEvent[] {
  if (config.instruments.violinDoublesPhraseStarts !== true) return [];
  const out: MusicalEvent[] = [];
  const spq = secPerQuarter(input.bpm);
  for (let bar = 0; bar < bars; bar++) {
    if (!isPhraseStartBar(input, bar)) continue;
    const start = barStartSec(input, bar);
    const end = start + barQuarters(input.meter) * spq;
    for (const m of input.melody) {
      if (m.startTime < start || m.startTime >= end) continue;
      const midi = Math.max(55, Math.min(88, Math.round(m.midi)));
      const beat = (m.startTime - start) / spq;
      out.push(
        note("violin", bar, beat, midi, m.startTime, Math.max(m.duration, spq * 0.5), vel(0.8, input.energy01)),
      );
    }
  }
  return out;
}

/**
 * Sax: melodic fills on the last beat, mid-energy and above only.
 * Below the floor the horn stays silent — pinned by tests.
 */
export function planSax(input: PassageInput, bars: number): MusicalEvent[] {
  if (clamp01(input.energy01) < config.instruments.saxFillEnergyMin) return [];
  const out: MusicalEvent[] = [];
  const barQ = barQuarters(input.meter);
  const spq = secPerQuarter(input.bpm);
  for (let bar = 0; bar < bars; bar++) {
    const chord = chordAt(input, bar);
    const tones = chordTones(chord);
    const base = 66 + (((chord.root - (66 % 12)) % 12) + 12) % 12;
    const line = [0, 1, 2, 0].map((ti, k) => {
      const pc = tones[ti % tones.length];
      return base + ((((pc - (base % 12)) % 12) + 12) % 12) + (k === 3 ? 12 : 0);
    });
    const start = barStartSec(input, bar);
    const fillBeat = Math.max(0, barQ - 1);
    line.forEach((midi, k) => {
      const beat = fillBeat + k * 0.25;
      if (beat >= barQ) return;
      out.push(
        note("sax", bar, beat, midi, start + beat * spq, spq * 0.22, vel(0.8, input.energy01)),
      );
    });
  }
  return out;
}

/** Accordion: chordal sustain with a bellows pulse on every beat. */
export function planAccordion(input: PassageInput, bars: number): MusicalEvent[] {
  const out: MusicalEvent[] = [];
  const barQ = barQuarters(input.meter);
  const spq = secPerQuarter(input.bpm);
  for (let bar = 0; bar < bars; bar++) {
    const chord = chordAt(input, bar);
    const tones = chordTones(chord);
    const base = 53 + (((chord.root - (53 % 12)) % 12) + 12) % 12;
    const midis = tones.map((pc) => base + ((((pc - (base % 12)) % 12) + 12) % 12));
    const start = barStartSec(input, bar);
    for (let q = 0; q < Math.floor(barQ); q++) {
      for (const midi of midis) {
        out.push(
          note("accordion", bar, q, midi, start + q * spq, spq * 0.9, vel(0.55, input.energy01)),
        );
      }
    }
  }
  return out;
}
