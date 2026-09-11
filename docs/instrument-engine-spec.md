# Instrument engine spec (§23–25) — Phase 6

## Interface (normative)

```ts
interface InstrumentEngine {
  readonly id: InstrumentId;
  schedule(events: MusicalEvent[], ctx: ScheduleContext): void;
  stop(all?: boolean): void;
  setVolume(v: number): void;   // 0–1
  setPan(p: number): void;      // -1–1
}
interface MusicalEvent { note: NoteEvent; instrument: InstrumentId; bar: number; beat: number; }
interface ScheduleContext { audioTime: number; tempo: TempoState; meter: TimeSignature; }
```

Each instrument independently controllable (mute/solo/volume/pan). New instrument = new file + registry row; no conductor/engine edits.

## The eight (behavioral contracts)

| Instrument | Role | Pattern source |
|---|---|---|
| drums | meter + energy from rhythm engine (never pitch) | data patterns: 4/4, 3/4, 6/8 × style |
| bass | roots + fifths, phrase-anchored | `bass: "root-and-fifth"` etc. per style |
| piano | harmony voicings, broken chords | style piano patterns |
| guitar (ac/separate acoustic vs electric voicing+timbre) | strum/arpeggiate | style guitar patterns |
| strings | sustained pads, swells with energy | style strings behavior |
| violin | lead doubling / counter-melody, enters on boundaries | arrangement cues |
| sax | melodic fills, mid-energy+ | arrangement cues |
| accordion | chordal sustain, folk/latin styles | style behavior |

## Synthesis (§24)

- Abstraction: `MusicalEvent → render(instrument)`; same event renders on any engine.
- Phase 6: Web Audio oscillators + noise (drums) + filtered envelopes; no copyrighted samples.
  Sample maps allowed only with clear license metadata (`public/samples/*.json` manifest).
- Tone.js: deferred (TDR-02); introduce only if it reduces scheduler code without latency cost.

## Scheduling (§25)

Look-ahead scheduler: timer 25 ms, horizon 120 ms (tunable `AUDIO_LOOKAHEAD_MS`);
events sorted by audioTime; jitter guard drops late events to diagnostics counter, never crashes.
