/**
 * Key estimation (Phase 3, §12). Rolling pitch-class histogram weighted by
 * duration × confidence × recency → Krumhansl-style correlation against
 * major/minor profiles → ranked candidates.
 *
 * Pipeline position: NoteEvents (completed, duration > 0) → KeyUpdated.
 * Pure apart from the injected event bus. Thresholds come from
 * `config.key` only (`windowMs`, `updateDelta`).
 *
 * Rules:
 * - Never locks on the first note: confidence scales with evidence
 *   (total weighted duration + distinct pitch-class count), so a single
 *   pitch yields a low-confidence estimate that later evidence revises.
 * - Emits `KeyUpdated` only when the top key (root/mode) changes or
 *   |Δconfidence| > `config.key.updateDelta`.
 * - `addChordEvidence` (Phase 4 hook) adds a small bonus to chord tones —
 *   it nudges, never overrides, the melody histogram.
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { chordTones } from "./chords";
import type {
  Chord,
  Confidence,
  KeyEstimate,
  NoteEvent,
  PitchClass,
} from "@/domain/types";

/** Krumhansl–Kessler tonal profiles (index 0 = tonic). */
export const KRUMHANSL_MAJOR: readonly number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
] as const;

export const KRUMHANSL_MINOR: readonly number[] = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
] as const;

/** Weighted seconds needed for full evidence (documented ramp, not a gate). */
const FULL_EVIDENCE_WEIGHT = 1.2;
/** Distinct pitch-classes needed for full evidence. */
const FULL_EVIDENCE_PCS = 3;
/** Memory bound for the rolling store (not a threshold). */
const MAX_ENTRIES = 512;
/** Default per-tone bonus for chord feedback (Phase 4 hook). */
const DEFAULT_CHORD_WEIGHT = 0.3;

export interface KeyCandidate extends KeyEstimate {
  correlation: number;
}

export interface KeyRanking {
  top: KeyEstimate;
  ranked: KeyCandidate[];
}

function mod12(n: number): PitchClass {
  return (((Math.round(n) % 12) + 12) % 12) as PitchClass;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Pearson correlation (0 when either vector is flat). */
export function pearson(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/**
 * Histogram (12 bins) → ranked keys. Pure. Returns null when empty.
 * Confidence = mapped correlation × evidence factor, so thin evidence
 * (one note) can never report high confidence.
 */
export function estimateKeyFromHistogram(hist: readonly number[]): KeyRanking | null {
  if (hist.length !== 12) throw new Error("histogram must have 12 bins");
  const total = hist.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const distinct = hist.filter((v) => v > 1e-9).length;
  const evidence =
    Math.min(1, total / FULL_EVIDENCE_WEIGHT) * Math.min(1, distinct / FULL_EVIDENCE_PCS);
  const factor = 0.25 + 0.75 * evidence;

  const ranked: KeyCandidate[] = [];
  for (let root = 0; root < 12; root++) {
    for (const mode of ["major", "minor"] as const) {
      const profile = mode === "major" ? KRUMHANSL_MAJOR : KRUMHANSL_MINOR;
      const rotated = Array.from(
        { length: 12 },
        (_, pc) => profile[(pc - root + 12) % 12],
      );
      const corr = pearson(hist, rotated);
      ranked.push({
        root: root as PitchClass,
        mode,
        confidence: clamp01(((corr + 1) / 2) * factor),
        correlation: corr,
      });
    }
  }
  ranked.sort((a, b) => b.correlation - a.correlation);
  const top = ranked[0];
  return {
    top: { root: top.root, mode: top.mode, confidence: top.confidence },
    ranked,
  };
}

export interface WeightedNote {
  pc: PitchClass;
  /** duration × confidence (recency applied at estimate time). */
  base: number;
  /** (startTime + duration) in audio-clock ms. */
  endMs: number;
}

/** NoteEvents → recency-weighted histogram inside `windowMs`. */
export function histogramFromNotes(
  notes: readonly WeightedNote[],
  nowMs: number,
  windowMs: number = config.key.windowMs,
): number[] {
  const hist = new Array<number>(12).fill(0);
  for (const n of notes) {
    const age = nowMs - n.endMs;
    if (!Number.isFinite(age) || age < 0 || age > windowMs) continue;
    const recency = 1 - age / windowMs;
    hist[n.pc] += n.base * recency;
  }
  return hist;
}

/** NoteEvents → key ranking (pure helper; the class owns the window). */
export function estimateKeyFromNotes(
  notes: readonly WeightedNote[],
  nowMs: number,
  windowMs: number = config.key.windowMs,
): KeyRanking | null {
  return estimateKeyFromHistogram(histogramFromNotes(notes, nowMs, windowMs));
}

function noteToWeighted(note: NoteEvent): WeightedNote | null {
  if (!Number.isFinite(note.midi) || !Number.isFinite(note.duration) || note.duration <= 0)
    return null;
  if (!Number.isFinite(note.confidence) || note.confidence <= 0) return null;
  if (!Number.isFinite(note.startTime) || note.startTime < 0) return null;
  return {
    pc: mod12(note.midi),
    base: note.duration * clamp01(note.confidence),
    endMs: (note.startTime + note.duration) * 1000,
  };
}

export class KeyEstimator {
  private notes: WeightedNote[] = [];
  private pending = new Map<string, { midi: number; confidence: Confidence; startTime: number }>();
  private current: KeyEstimate | null = null;
  private lastEmitted: KeyEstimate | null = null;
  private off: (() => void)[] = [];

  constructor(private readonly events: EventBus = bus) {
    this.off = [
      events.on("NoteStarted", (n) => {
        this.pending.set(n.id, { midi: n.midi, confidence: n.confidence, startTime: n.startTime });
        if (this.pending.size > 64) {
          const first = this.pending.keys().next().value;
          if (first) this.pending.delete(first);
        }
      }),
      events.on("NoteEnded", (e) => this.onNoteEnded(e.id, e.duration)),
    ];
  }

  /** Detach bus subscriptions (tests / teardown). */
  dispose(): void {
    this.off.forEach((fn) => fn());
    this.off = [];
  }

  reset(): void {
    this.notes.length = 0;
    this.pending.clear();
    this.current = null;
    this.lastEmitted = null;
  }

  /** Last computed estimate (null before any in-window evidence). */
  estimate(): KeyEstimate | null {
    return this.current ? { ...this.current } : null;
  }

  /** Feed a completed NoteEvent (duration > 0). Duration-less attacks are ignored. */
  addNote(note: NoteEvent): void {
    const w = noteToWeighted(note);
    if (!w) return;
    this.notes.push(w);
    if (this.notes.length > MAX_ENTRIES) {
      this.notes.splice(0, this.notes.length - MAX_ENTRIES);
    }
  }

  /**
   * Phase 4 hook: chord feedback as a small histogram bonus (default 0.3
   * weighted-seconds spread over chord tones). Never overrides melody.
   */
  addChordEvidence(chord: Chord, nowMs: number, weight: number = DEFAULT_CHORD_WEIGHT): void {
    if (!Number.isFinite(nowMs) || !Number.isFinite(weight) || weight <= 0) return;
    const tones = chordTones(chord);
    const per = weight / tones.length;
    for (const pc of tones) {
      this.notes.push({ pc, base: per, endMs: nowMs });
    }
    if (this.notes.length > MAX_ENTRIES) {
      this.notes.splice(0, this.notes.length - MAX_ENTRIES);
    }
  }

  /**
   * Advance to `nowMs` (audio-clock ms): prune the rolling window,
   * re-estimate, and emit `KeyUpdated` only when the top key changed or
   * |Δconfidence| > `config.key.updateDelta`. Returns the current top
   * (null when the window is empty).
   */
  tick(nowMs: number, windowMs: number = config.key.windowMs): KeyEstimate | null {
    this.notes = this.notes.filter((n) => nowMs - n.endMs <= windowMs && nowMs >= n.endMs);
    const ranking = estimateKeyFromNotes(this.notes, nowMs, windowMs);
    this.current = ranking ? { ...ranking.top } : null;
    if (!this.current) return null;
    const prev = this.lastEmitted;
    const changed =
      !prev ||
      prev.root !== this.current.root ||
      prev.mode !== this.current.mode ||
      Math.abs(this.current.confidence - prev.confidence) > config.key.updateDelta;
    if (changed) {
      this.lastEmitted = { ...this.current };
      this.events.emit("KeyUpdated", { ...this.current });
    }
    return { ...this.current };
  }

  private onNoteEnded(id: string, duration: number): void {
    const p = this.pending.get(id);
    this.pending.delete(id);
    if (!p) return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    this.addNote({
      id,
      pitch: 440,
      midi: Math.round(p.midi),
      startTime: p.startTime,
      duration,
      velocity: p.confidence,
      confidence: p.confidence,
      source: "voice",
    });
  }
}
