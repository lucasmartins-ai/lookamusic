/**
 * Central MusicalState store (Phase 8, §32). Pure apart from the injected
 * event bus. Subscribes to every domain event the engines emit and holds
 * the single source of truth the UI renders — audio output stays a
 * rendering of this graph, never the truth.
 *
 * Memory-bounded: melody/chord/phrase rings cap at `config.conductor`
 * (soak-safe; Phase 14 asserts ≤ 5% growth over 60 min).
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { getScale } from "@/features/music/theory/scales";
import type {
  ArrangementState,
  ChordEvent,
  DynamicsState,
  KeyEstimate,
  MusicalState,
  NoteEvent,
  RhythmState,
  Scale,
  TempoState,
  TimeSignature,
} from "@/domain/types";

export interface PhraseRecord {
  id: string;
  startTime: number;
  endTime: number | null;
}

function defaultTempo(): TempoState {
  const b = config.rhythm.defaultBpm;
  return { estimated: b, target: b, playback: b, confidence: 0 };
}

function defaultKey(): KeyEstimate {
  return { root: 0, mode: "major", confidence: 0 };
}

export class ConductorState {
  private tempo: TempoState = defaultTempo();
  private meter: TimeSignature = { numerator: 4, denominator: 4 };
  private key: KeyEstimate = defaultKey();
  private melody: NoteEvent[] = [];
  private readonly open = new Map<string, NoteEvent>();
  private chords: ChordEvent[] = [];
  private arrangement: ArrangementState = {
    active: {
      drums: true, bass: true, piano: true, guitar: true,
      strings: false, violin: false, sax: false, accordion: false,
    },
    energy: 0.5,
  };
  private dynamics: DynamicsState = { inputEnergy: 0, smoothedEnergy: 0, level: "low" };
  private phrases: PhraseRecord[] = [];
  private density = 0;
  private onsets: number[] = [];
  private off: (() => void)[] = [];
  /** Wall-clock ms of the last event per name (sync measurement). */
  readonly lastEventMs = new Map<string, number>();

  constructor(private readonly events: EventBus = bus) {
    const stamp = (name: string) => () => {
      this.lastEventMs.set(name, Date.now());
    };
    this.off = [
      events.on("NoteStarted", (n) => { this.onNoteStarted({ ...n }); stamp("NoteStarted")(); }),
      events.on("NoteChanged", (u) => {
        const o = this.open.get(u.id);
        if (o) { o.midi = u.midi; o.confidence = u.confidence; }
        const m = this.melody.find((x) => x.id === u.id);
        if (m) { m.midi = u.midi; m.confidence = u.confidence; }
        stamp("NoteChanged")();
      }),
      events.on("NoteEnded", (e) => { this.onNoteEnded(e.id, e.duration); stamp("NoteEnded")(); }),
      events.on("TempoUpdated", (t) => { this.tempo = { ...t }; stamp("TempoUpdated")(); }),
      events.on("MeterChanged", (m) => { this.meter = { ...m }; stamp("MeterChanged")(); }),
      events.on("KeyUpdated", (k) => { this.key = { ...k }; stamp("KeyUpdated")(); }),
      events.on("ChordChanged", (c) => { this.onChord({ ...c }); stamp("ChordChanged")(); }),
      events.on("InstrumentAdded", ({ instrument }) => {
        this.arrangement = { ...this.arrangement, active: { ...this.arrangement.active, [instrument]: true } };
        stamp("InstrumentAdded")();
      }),
      events.on("InstrumentRemoved", ({ instrument }) => {
        this.arrangement = { ...this.arrangement, active: { ...this.arrangement.active, [instrument]: false } };
        stamp("InstrumentRemoved")();
      }),
      events.on("EnergyChanged", ({ energy }) => {
        const e = Number.isFinite(energy) ? Math.min(1, Math.max(0, energy)) : 0;
        this.dynamics = { ...this.dynamics, inputEnergy: e, smoothedEnergy: e };
        this.arrangement = { ...this.arrangement, energy: e };
        stamp("EnergyChanged")();
      }),
      events.on("PhraseStarted", (p) => {
        this.phrases.push({ id: p.id, startTime: p.startTime, endTime: null });
        this.trimPhrases();
        stamp("PhraseStarted")();
      }),
      events.on("PhraseEnded", (p) => {
        const rec = this.phrases.find((x) => x.id === p.id);
        if (rec) rec.endTime = p.endTime;
        stamp("PhraseEnded")();
      }),
    ];
  }

  dispose(): void {
    this.off.forEach((fn) => fn());
    this.off = [];
  }

  reset(): void {
    this.tempo = defaultTempo();
    this.meter = { numerator: 4, denominator: 4 };
    this.key = defaultKey();
    this.melody = [];
    this.open.clear();
    this.chords = [];
    this.phrases = [];
    this.density = 0;
    this.onsets = [];
    this.lastEventMs.clear();
  }

  private onNoteStarted(n: NoteEvent): void {
    this.open.set(n.id, { ...n });
    if (this.open.size > 64) {
      const first = this.open.keys().next().value;
      if (first) this.open.delete(first);
    }
    this.melody.push({ ...n });
    if (Number.isFinite(n.startTime)) {
      this.onsets.push(n.startTime);
      if (this.onsets.length > 32) this.onsets.splice(0, this.onsets.length - 32);
    }
    const cap = config.conductor.melodyCap;
    if (this.melody.length > cap) this.melody.splice(0, this.melody.length - cap);
  }

  private onNoteEnded(id: string, duration: number): void {
    const o = this.open.get(id);
    if (o) {
      o.duration = duration;
      this.open.delete(id);
    }
    const m = this.melody.find((x) => x.id === id);
    if (m) m.duration = duration;
  }

  private onChord(c: ChordEvent): void {
    this.chords.push(c);
    const cap = config.conductor.chordCap;
    if (this.chords.length > cap) this.chords.splice(0, this.chords.length - cap);
  }

  private trimPhrases(): void {
    const cap = config.conductor.phraseCap;
    if (this.phrases.length > cap) this.phrases.splice(0, this.phrases.length - cap);
  }

  setDensity(d: number): void {
    this.density = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0;
  }

  setDynamics(d: DynamicsState): void {
    this.dynamics = { ...d };
  }

  melodyNotes(): NoteEvent[] {
    return this.melody.map((n) => ({ ...n }));
  }

  chordEvents(): ChordEvent[] {
    return this.chords.map((c) => ({ ...c, chord: { ...c.chord } }));
  }

  phraseRecords(): PhraseRecord[] {
    return this.phrases.map((p) => ({ ...p }));
  }

  onsetTimes(): number[] {
    return [...this.onsets];
  }

  currentTempo(): TempoState {
    return { ...this.tempo };
  }

  currentMeter(): TimeSignature {
    return { ...this.meter };
  }

  currentKey(): KeyEstimate {
    return { ...this.key };
  }

  /** Full domain snapshot for renderers and persistence. */
  snapshot(): MusicalState {
    const scale: Scale = this.key.mode === "minor"
      ? getScale("natural-minor")
      : getScale("major");
    const rhythm: RhythmState = {
      tempo: { ...this.tempo },
      meter: { ...this.meter },
      density: this.density,
      onsets: [...this.onsets],
    };
    return {
      tempo: { ...this.tempo },
      timeSignature: { ...this.meter },
      key: { ...this.key },
      scale,
      melody: this.melody.map((n) => ({ ...n })),
      chords: this.chords.map((c) => ({ ...c, chord: { ...c.chord } })),
      rhythm,
      arrangement: { ...this.arrangement, active: { ...this.arrangement.active } },
      dynamics: { ...this.dynamics },
    };
  }
}
