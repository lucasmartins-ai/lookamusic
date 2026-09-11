/**
 * Domain event payloads (§33). Companion: docs/event-model.md
 */
import type {
  ChordEvent,
  Confidence,
  GestureEvent,
  InstrumentId,
  KeyEstimate,
  NoteEvent,
  PitchObservation,
  TempoState,
  TimeSignature,
} from "./types";

export interface DomainEvents {
  PitchDetected: PitchObservation;
  NoteStarted: NoteEvent;
  NoteChanged: { id: string; midi: number; confidence: Confidence };
  NoteEnded: { id: string; duration: number };
  TempoUpdated: TempoState;
  MeterChanged: TimeSignature;
  KeyUpdated: KeyEstimate;
  ChordChanged: ChordEvent;
  InstrumentAdded: { instrument: InstrumentId };
  InstrumentRemoved: { instrument: InstrumentId };
  EnergyChanged: { energy: number };
  GestureDetected: GestureEvent;
  PhraseStarted: { id: string; startTime: number };
  PhraseEnded: { id: string; startTime: number; endTime: number };
  RecordingStarted: { sessionId: string };
  RecordingStopped: { sessionId: string; reason?: string };
}

export type DomainEventName = keyof DomainEvents;
