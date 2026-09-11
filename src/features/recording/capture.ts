/**
 * Structured Session Capture (Phase 11, §41).
 * Records note events, chords, tempo, meter, key, and arrangement in real time.
 * Pure orchestration over the event bus — preserves structured representation
 * separate from any audio output.
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { newId } from "@/lib/ids";
import {
  INSTRUMENTS,
  type ArrangementState,
  type ChordEvent,
  type Composition,
  type InstrumentId,
  type KeyEstimate,
  type NoteEvent,
  type TimeSignature,
} from "@/domain/types";
import { validateComposition } from "./schema";

export interface SessionRecorderOptions {
  bus?: EventBus;
  styleId?: string;
  name?: string;
}

export class SessionRecorder {
  private readonly events: EventBus;
  private activeSessionId: string | null = null;
  private startTimeWallMs = 0;
  private startTimeTransportSec = 0;
  private subscriptions: (() => void)[] = [];

  // Recorded session state
  private tempo: number = config.rhythm.defaultBpm;
  private meter: TimeSignature = { numerator: 4, denominator: 4 };
  private key: KeyEstimate = { root: 0, mode: "major", confidence: 0 };
  private scaleId = "major";
  private melody: NoteEvent[] = [];
  private openNotes = new Map<string, NoteEvent>();
  private chords: ChordEvent[] = [];
  private arrangement: ArrangementState = {
    active: {
      drums: true,
      bass: true,
      piano: true,
      guitar: true,
      strings: false,
      violin: false,
      sax: false,
      accordion: false,
    },
    energy: 0.5,
  };
  private instruments: Record<InstrumentId, { volume: number; pan: number; muted: boolean }>;
  private styleId: string;
  private name: string;

  constructor(opts?: SessionRecorderOptions) {
    this.events = opts?.bus ?? bus;
    this.styleId = opts?.styleId ?? config.recording.defaultStyleId;
    this.name = opts?.name ?? "Nova Sessão";

    this.instruments = {} as Record<
      InstrumentId,
      { volume: number; pan: number; muted: boolean }
    >;
    for (const id of INSTRUMENTS) {
      this.instruments[id] = { volume: 0.9, pan: 0, muted: false };
    }
  }

  get isRecording(): boolean {
    return this.activeSessionId !== null;
  }

  get sessionId(): string | null {
    return this.activeSessionId;
  }

  start(sessionId?: string, startTransportSec = 0): string {
    if (this.activeSessionId) {
      this.stop("restarted");
    }

    const sid = sessionId ?? newId("rec");
    this.activeSessionId = sid;
    this.startTimeWallMs = Date.now();
    this.startTimeTransportSec = startTransportSec;

    this.melody = [];
    this.openNotes.clear();
    this.chords = [];

    this.subscriptions = [
      this.events.on("NoteStarted", (n) => {
        if (!this.isRecording) return;
        let normalizedStart = Math.max(0, n.startTime - this.startTimeTransportSec);
        if (n.startTime > 1_000_000) {
          const epochStartSec = this.startTimeWallMs / 1000;
          normalizedStart = Math.max(0, Number((n.startTime - epochStartSec).toFixed(4)));
        }
        const recorded: NoteEvent = {
          ...n,
          startTime: normalizedStart,
        };
        this.openNotes.set(n.id, recorded);
        this.melody.push(recorded);
      }),
      this.events.on("NoteChanged", (u) => {
        if (!this.isRecording) return;
        const open = this.openNotes.get(u.id);
        if (open) {
          open.midi = u.midi;
          open.confidence = u.confidence;
        }
        const m = this.melody.find((n) => n.id === u.id);
        if (m) {
          m.midi = u.midi;
          m.confidence = u.confidence;
        }
      }),
      this.events.on("NoteEnded", (e) => {
        if (!this.isRecording) return;
        const open = this.openNotes.get(e.id);
        if (open) {
          open.duration = e.duration;
          this.openNotes.delete(e.id);
        }
        const m = this.melody.find((n) => n.id === e.id);
        if (m) {
          m.duration = e.duration;
        }
      }),
      this.events.on("ChordChanged", (c) => {
        if (!this.isRecording) return;
        this.chords.push({
          ...c,
          chord: { ...c.chord },
        });
      }),
      this.events.on("TempoUpdated", (t) => {
        if (!this.isRecording) return;
        this.tempo = t.playback;
      }),
      this.events.on("MeterChanged", (m) => {
        if (!this.isRecording) return;
        this.meter = { ...m };
      }),
      this.events.on("KeyUpdated", (k) => {
        if (!this.isRecording) return;
        this.key = { ...k };
        this.scaleId = k.mode === "minor" ? "natural-minor" : "major";
      }),
      this.events.on("InstrumentAdded", (e) => {
        if (!this.isRecording) return;
        this.arrangement.active = { ...this.arrangement.active, [e.instrument]: true };
      }),
      this.events.on("InstrumentRemoved", (e) => {
        if (!this.isRecording) return;
        this.arrangement.active = { ...this.arrangement.active, [e.instrument]: false };
      }),
      this.events.on("EnergyChanged", (e) => {
        if (!this.isRecording) return;
        this.arrangement.energy = Math.min(1, Math.max(0, e.energy));
      }),
    ];

    this.events.emit("RecordingStarted", { sessionId: sid });
    return sid;
  }

  stop(reason?: string): Composition {
    if (!this.activeSessionId) {
      throw new Error("No active recording session to stop.");
    }

    const sid = this.activeSessionId;
    this.activeSessionId = null;

    // Clean up subscriptions
    for (const unsub of this.subscriptions) {
      unsub();
    }
    this.subscriptions = [];

    // Finalize any open notes with a default minimal duration if not closed
    for (const [id, open] of this.openNotes.entries()) {
      if (open.duration <= 0) {
        open.duration = 0.25;
      }
    }
    this.openNotes.clear();

    this.events.emit("RecordingStopped", { sessionId: sid, reason });

    return this.toComposition(undefined, sid);
  }

  toComposition(customName?: string, explicitId?: string): Composition {
    const now = new Date().toISOString();
    const comp: Composition = {
      id: explicitId ?? this.activeSessionId ?? newId("comp"),
      name: customName ?? this.name,
      createdAt: now,
      updatedAt: now,
      tempo: this.tempo,
      timeSignature: { ...this.meter },
      key: { ...this.key },
      scaleId: this.scaleId,
      melody: this.melody.map((n) => ({ ...n })),
      chords: this.chords.map((c) => ({ ...c, chord: { ...c.chord } })),
      arrangement: {
        active: { ...this.arrangement.active },
        energy: this.arrangement.energy,
      },
      instruments: { ...this.instruments },
      styleId: this.styleId,
      metadata: {
        recordedAt: now,
        noteCount: this.melody.length,
        chordCount: this.chords.length,
      },
    };

    return validateComposition(comp);
  }
}
