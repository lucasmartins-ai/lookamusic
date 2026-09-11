# LookaMusic — Domain Model (§47)

Pure TypeScript. No React, no Web Audio imports allowed in `src/domain` or `src/features/music/theory`.
All thresholds live in `src/lib/config.ts`, never hardcoded at call sites.

## Core scalars

```ts
type Hertz = number;        // > 0
type MidiNote = number;     // integer 0–127
type PitchClass = 0|1|2|3|4|5|6|7|8|9|10|11; // C=0 … B=11
type Confidence = number;   // 0–1
type BPM = number;
```

## Pitch (§8, §10)

```ts
interface PitchObservation {
  frequency: Hertz;     // -1 when unvoiced
  midiNote: number;     // fractional, e.g. 69.2; -1 when unvoiced
  confidence: Confidence;
  clarity: Confidence;  // periodicity strength, independent of musical fit
  timestamp: number;    // audio-clock ms (performance.now() domain documented at call site)
}
interface PitchDetector {
  readonly name: string;
  process(buffer: Float32Array, sampleRate: number): PitchObservation;
  reset(): void;
}
```

## Notes & events (§10)

```ts
type NoteSource = "voice" | "generated" | "edited";
interface NoteEvent {
  id: string; pitch: Hertz; midi: MidiNote;
  startTime: number;      // transport seconds
  duration: number;       // seconds, > 0
  velocity: number;       // 0–1
  confidence: Confidence;
  source: NoteSource;
}
```

Pipeline states: `raw pitch → confidence-filtered → smoothed → candidate (hysteresis) → stable (min-duration) → NoteEvent`.

## Theory objects

```ts
interface IntervalInfo { semitones: number; name: string; short: string; } // "major third", "M3"
interface Scale { id: string; name: string; intervals: number[]; }         // e.g. major [0,2,4,5,7,9,11]
interface KeyEstimate { root: PitchClass; mode: "major" | "minor"; confidence: Confidence; }
type ChordQuality = "major" | "minor" | "diminished" | "augmented"
  | "dom7" | "maj7" | "min7" | "sus2" | "sus4";
interface Chord { root: PitchClass; quality: ChordQuality; extensions?: string[]; inversion?: number; }
interface ChordEvent { id: string; chord: Chord; startBar: number; durationBars: number; confidence: Confidence; }
type HarmonicFunction = "TONIC" | "SUBDOMINANT" | "DOMINANT" | "UNKNOWN";
```

Harmony ranking (Phase 4, `src/features/music/harmony/`): `ChordCandidate = { chord, score 0–1, reasons }` (reasons feed Phase 13); `HarmonyContext` carries key + scale + melody + phrase position + style + previous chord.

Minimum scale registry (Phase 3): major, natural/harmonic/melodic minor. Modes (dorian…locrian) reserved as data additions, no engine change.

## Rhythm (§20–22)

```ts
type TimeSignature = { numerator: 3 | 4 | 6; denominator: 4 | 8; }; // 4/4, 3/4, 6/8 minimum
interface TempoState { estimated: BPM; target: BPM; playback: BPM; confidence: Confidence; }
interface RhythmState { tempo: TempoState; meter: TimeSignature; density: number; onsets: number[]; }
```

`estimated → target` (slew-limited) → `playback` (transport). Never snap playback directly to estimates.

## Arrangement & dynamics (§29, §31)

```ts
type InstrumentId = "drums" | "bass" | "piano" | "guitar" | "strings" | "violin" | "sax" | "accordion";
interface ArrangementState { active: Record<InstrumentId, boolean>; energy: number; /* 0–1 */ }
interface DynamicsState { inputEnergy: number; smoothedEnergy: number; level: "low" | "medium" | "high"; }
```

Transitions occur on bar/phrase boundaries with fades — never mid-beat cuts.
Energy→lineup/density mapping is data in `music/arrangement/presets.ts`
(`ENERGY_ENSEMBLE`/`ENERGY_DENSITY`, Phase 7); styles resolve drum patterns
there, never via engine branches.

## Musical state (§11)

```ts
interface MusicalState {
  tempo: TempoState; timeSignature: TimeSignature;
  key: KeyEstimate; scale: Scale;
  melody: NoteEvent[]; chords: ChordEvent[];
  rhythm: RhythmState; arrangement: ArrangementState; dynamics: DynamicsState;
}
```

## Composition & storage (§41)

```ts
interface Composition {
  id: string; name: string; createdAt: string; updatedAt: string;
  tempo: BPM; timeSignature: TimeSignature; key: KeyEstimate; scaleId: string;
  melody: NoteEvent[]; chords: ChordEvent[]; arrangement: ArrangementState;
  instruments: Record<InstrumentId, { volume: number; pan: number; muted: boolean }>;
  styleId: string; metadata: Record<string, unknown>;
}
```

Reference implementation lives in `src/domain/` + `src/features/music/theory/`; this doc is normative, code follows it.

## Gestures (§27–28)

```ts
type GestureKind = "OPEN_HAND" | "CLOSED_HAND" | "ONE_FINGER" | "TWO_FINGERS" | "THREE_FINGERS"
  | "SWIPE_UP" | "SWIPE_DOWN" | "SWIPE_LEFT" | "SWIPE_RIGHT";
interface GestureEvent { kind: GestureKind; confidence: Confidence; timestamp: number; }
```

Every gesture maps to an Arrangement action that also exists as a button/keyboard control (§44).
