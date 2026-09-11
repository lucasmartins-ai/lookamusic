/**
 * Domain types (§47). Pure — no React, no Web Audio.
 * Normative companion: docs/domain-model.md
 */

export type Hertz = number;
export type MidiNote = number; // integer 0–127 for events; fractional for observations
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type Confidence = number; // 0–1
export type BPM = number;

/** §8 — one analysis frame. frequency/midiNote are -1 when unvoiced. */
export interface PitchObservation {
  frequency: Hertz;
  midiNote: number; // fractional, e.g. 69.2
  confidence: Confidence;
  /** Periodicity strength, independent of musical fit. */
  clarity: Confidence;
  /** performance.now() domain ms at detection. */
  timestamp: number;
}

export const UNVOICED = -1;

export type NoteSource = "voice" | "generated" | "edited";

/** §10 — source of truth for musical content. */
export interface NoteEvent {
  id: string;
  pitch: Hertz;
  midi: MidiNote;
  /** transport seconds */
  startTime: number;
  duration: number;
  /** 0–1 */
  velocity: number;
  confidence: Confidence;
  source: NoteSource;
}

export interface IntervalInfo {
  semitones: number;
  name: string; // "major third"
  short: string; // "M3"
}

export interface Scale {
  id: string;
  name: string;
  intervals: number[];
}

export interface KeyEstimate {
  root: PitchClass;
  mode: "major" | "minor";
  confidence: Confidence;
}

export type ChordQuality =
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "dom7"
  | "maj7"
  | "min7"
  | "sus2"
  | "sus4";

export interface Chord {
  root: PitchClass;
  quality: ChordQuality;
  extensions?: string[];
  inversion?: number;
}

export interface ChordEvent {
  id: string;
  chord: Chord;
  startBar: number;
  durationBars: number;
  confidence: Confidence;
}

export type HarmonicFunction = "TONIC" | "SUBDOMINANT" | "DOMINANT" | "UNKNOWN";

export interface TimeSignature {
  numerator: 3 | 4 | 6;
  denominator: 4 | 8;
}

export interface TempoState {
  estimated: BPM;
  target: BPM;
  playback: BPM;
  confidence: Confidence;
}

export interface RhythmState {
  tempo: TempoState;
  meter: TimeSignature;
  /** 0–1 onsets per second, normalized */
  density: number;
  onsets: number[];
}

export type InstrumentId =
  | "drums"
  | "bass"
  | "piano"
  | "guitar"
  | "strings"
  | "violin"
  | "sax"
  | "accordion";

export const INSTRUMENTS: readonly InstrumentId[] = [
  "drums",
  "bass",
  "piano",
  "guitar",
  "strings",
  "violin",
  "sax",
  "accordion",
] as const;

export interface ArrangementState {
  active: Record<InstrumentId, boolean>;
  /** 0–1 */
  energy: number;
}

export interface DynamicsState {
  inputEnergy: number;
  smoothedEnergy: number;
  level: "low" | "medium" | "high";
}

/** §11 — single source of truth. */
export interface MusicalState {
  tempo: TempoState;
  timeSignature: TimeSignature;
  key: KeyEstimate;
  scale: Scale;
  melody: NoteEvent[];
  chords: ChordEvent[];
  rhythm: RhythmState;
  arrangement: ArrangementState;
  dynamics: DynamicsState;
}

export type GestureKind =
  | "OPEN_HAND"
  | "CLOSED_HAND"
  | "ONE_FINGER"
  | "TWO_FINGERS"
  | "THREE_FINGERS"
  | "SWIPE_UP"
  | "SWIPE_DOWN"
  | "SWIPE_LEFT"
  | "SWIPE_RIGHT";

export interface GestureEvent {
  kind: GestureKind;
  confidence: Confidence;
  timestamp: number;
}

export interface Composition {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tempo: BPM;
  timeSignature: TimeSignature;
  key: KeyEstimate;
  scaleId: string;
  melody: NoteEvent[];
  chords: ChordEvent[];
  arrangement: ArrangementState;
  instruments: Record<InstrumentId, { volume: number; pan: number; muted: boolean }>;
  styleId: string;
  metadata: Record<string, unknown>;
}

export type PitchCoachState =
  | "silent"
  | "unclear"
  | "in-tune"
  | "flat"
  | "sharp"
  | "out-of-key";

export interface VocalCoachFeedback {
  state: PitchCoachState;
  cents: number;
  targetMidi: number;
  targetNote: string;
  targetFreq: Hertz;
  message: string;
  inTune: boolean;
  accuracyScore: number;
  streakMs: number;
}

export type AutotuneSpeed = "natural" | "pop" | "hard";
export type AutotuneSnapMode = "chromatic" | "key";

export interface AutotuneConfig {
  enabled: boolean;
  speed: AutotuneSpeed;
  snapMode: AutotuneSnapMode;
  amount: number;
  monitorVolume: number;
}
