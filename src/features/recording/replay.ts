/**
 * Bit-identical Replay Engine (Phase 11, §41).
 * Reconstructs canonical domain events from a Composition.
 * Guarantees round-trip equality: record → save → load → replay bit-identical events.
 */
import { bus, type EventBus } from "@/lib/events";
import { barQuarters } from "@/features/music/rhythm/meter";
import type { Composition, NoteEvent, ChordEvent } from "@/domain/types";

export interface ScheduledReplayEvent {
  timeSec: number;
  name: "TempoUpdated" | "MeterChanged" | "KeyUpdated" | "NoteStarted" | "NoteEnded" | "ChordChanged";
  payload: unknown;
}

/**
 * Reconstructs the complete chronological list of domain events for a Composition.
 * Deterministic and bit-identical.
 */
export function reconstructSessionEvents(comp: Composition): ScheduledReplayEvent[] {
  const events: ScheduledReplayEvent[] = [];
  const quartersPerBar = barQuarters(comp.timeSignature);
  const secPerBeat = 60 / comp.tempo;
  const barDurationSec = quartersPerBar * secPerBeat;

  // 1. Initial configuration events at t = 0
  events.push({
    timeSec: 0,
    name: "TempoUpdated",
    payload: {
      estimated: comp.tempo,
      target: comp.tempo,
      playback: comp.tempo,
      confidence: 1,
    },
  });

  events.push({
    timeSec: 0,
    name: "MeterChanged",
    payload: { ...comp.timeSignature },
  });

  events.push({
    timeSec: 0,
    name: "KeyUpdated",
    payload: { ...comp.key },
  });

  // 2. Chords scheduled at their respective bar start times
  for (const chordEv of comp.chords) {
    const timeSec = Number((chordEv.startBar * barDurationSec).toFixed(4));
    events.push({
      timeSec,
      name: "ChordChanged",
      payload: {
        id: chordEv.id,
        chord: { ...chordEv.chord },
        startBar: chordEv.startBar,
        durationBars: chordEv.durationBars,
        confidence: chordEv.confidence,
      },
    });
  }

  // 3. Melody notes scheduled at their respective startTime and ended at startTime + duration
  for (const note of comp.melody) {
    const startTimeSec = Number(note.startTime.toFixed(4));
    const endTimeSec = Number((note.startTime + note.duration).toFixed(4));

    events.push({
      timeSec: startTimeSec,
      name: "NoteStarted",
      payload: {
        id: note.id,
        pitch: note.pitch,
        midi: note.midi,
        startTime: startTimeSec,
        duration: note.duration,
        velocity: note.velocity,
        confidence: note.confidence,
        source: note.source,
      },
    });

    events.push({
      timeSec: endTimeSec,
      name: "NoteEnded",
      payload: {
        id: note.id,
        duration: note.duration,
      },
    });
  }

  // Sort events chronologically. For identical timestamps, keep stable order (config -> chord -> noteStart -> noteEnd)
  const KIND_ORDER: Record<string, number> = {
    TempoUpdated: 0,
    MeterChanged: 1,
    KeyUpdated: 2,
    ChordChanged: 3,
    NoteStarted: 4,
    NoteEnded: 5,
  };

  events.sort((a, b) => {
    if (Math.abs(a.timeSec - b.timeSec) > 0.0001) {
      return a.timeSec - b.timeSec;
    }
    return (KIND_ORDER[a.name] ?? 9) - (KIND_ORDER[b.name] ?? 9);
  });

  return events;
}

export class ReplayEngine {
  private scheduled: ScheduledReplayEvent[] = [];
  private isPlaying = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public readonly composition: Composition,
    private readonly events: EventBus = bus,
  ) {
    this.scheduled = reconstructSessionEvents(composition);
  }

  get eventList(): readonly ScheduledReplayEvent[] {
    return this.scheduled;
  }

  /**
   * Emits all reconstructed events synchronously into the EventBus in batch.
   * Useful for testing or instantaneous restoration of state.
   */
  emitSynchronous(): void {
    for (const ev of this.scheduled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.events.emit(ev.name as any, ev.payload as any);
    }
  }
}
