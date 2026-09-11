/**
 * Conductor (Phase 8, §32). Orchestration only — every musical decision
 * lives in the Phase 2–7 engines; here is clock + queue + schedule.
 *
 * Owns: `MusicalTransport` (bar/beat clock), `ConductorState` (central
 * MusicalState), bar harmony scheduling (via `harmony-driver.ts`, which
 * reuses the Phase 4 scorer), quantized arrangement drains, the
 * `LookaheadScheduler` fan-out to the 8 instrument engines, mixer levels,
 * manual pins (Fase 7 risco 3: pins sobrevivem ao Auto), latency tracking
 * and graceful degradation.
 *
 * Pure apart from the injected bus/band/scheduler clocks: no React, no
 * AudioContext import. The browser hook injects the real band + audio
 * clock; vitest injects fakes and drives time by hand.
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { newId } from "@/lib/ids";
import type {
  Chord,
  ChordEvent,
  InstrumentId,
  NoteEvent,
  PitchClass,
  PitchObservation,
  TempoState,
  TimeSignature,
} from "@/domain/types";
import type { GestureKind } from "@/domain/types";
import { ENERGY_ORDER, GestureSelection, gestureToIntent, isGestureKind } from "@/features/gestures/mapping";
import { PitchSmoother } from "@/features/music/melody/smoothing";
import { NoteStabilizer } from "@/features/music/melody/stabilization";
import { PhraseTracker } from "@/features/music/melody/phrases";
import { TempoEstimator } from "@/features/music/rhythm/tempo";
import { MeterTracker, barQuarters } from "@/features/music/rhythm/meter";
import { KeyEstimator } from "@/features/music/theory/key";
import { ArrangementEngine } from "@/features/music/arrangement/state";
import { DynamicsTracker, type EnergyLevel } from "@/features/music/arrangement/dynamics";
import { densityForEnergy, ensembleForEnergy, styleById, styleDrums } from "@/features/music/arrangement/presets";
import type { HarmonyStyleId, PhrasePosition } from "@/features/music/harmony/candidates";
import {
  planAccordion,
  planBass,
  planDrums,
  planGuitar,
  planPiano,
  planSax,
  planStrings,
  planViolin,
  type PassageInput,
} from "@/features/instruments/planning";
import type { InstrumentEngine, MusicalEvent } from "@/features/instruments/types";
import {
  defaultMixer,
  effectiveVolume,
  setChannelPan,
  setChannelVolume,
  toggleMute,
  toggleSolo,
  type MixerState,
} from "@/features/instruments/mixer";
import { LookaheadScheduler, type TickReport } from "@/features/instruments/scheduler";
import { MusicalTransport } from "./transport";
import { ConductorState } from "./state";
import { chooseChordForBar, scaleIdForKey } from "./harmony-driver";
import { LatencyTracker } from "./latency";
import { DegradationController, type DegradationSnapshot } from "./degradation";

export interface EngineSet {
  smoother: PitchSmoother;
  stabilizer: NoteStabilizer;
  phrases: PhraseTracker;
  tempo: TempoEstimator;
  meter: MeterTracker;
  key: KeyEstimator;
  arrangement: ArrangementEngine;
  dynamics: DynamicsTracker;
}

export function createEngines(events: EventBus = bus): EngineSet {
  const neutral = styleById("neutral");
  return {
    smoother: new PitchSmoother(),
    stabilizer: new NoteStabilizer(events),
    phrases: new PhraseTracker(events),
    tempo: new TempoEstimator(events),
    meter: new MeterTracker(events),
    key: new KeyEstimator(events),
    arrangement: new ArrangementEngine(events, {
      active: neutral.defaults.active,
      energy: neutral.defaults.energy ?? 0.5,
    }),
    dynamics: new DynamicsTracker(events),
  };
}

export interface PlannedHit {
  audioTime: number;
  bar: number;
  events: MusicalEvent[];
}

export interface ConductorOptions {
  band: Record<InstrumentId, InstrumentEngine>;
  /** Maps transport seconds → audio-clock seconds (default: identity). */
  toAudioTime?: (transportSec: number) => number;
  /** Scheduler clock (default: Date.now()/1000; browser: ctx.currentTime). */
  schedulerNow?: () => number;
  styleId?: string;
  seed?: string;
}

const PLAN_OF: Record<InstrumentId, (input: PassageInput, bars: number) => MusicalEvent[]> = {
  drums: planDrums,
  bass: planBass,
  piano: planPiano,
  guitar: planGuitar,
  strings: planStrings,
  violin: planViolin,
  sax: planSax,
  accordion: planAccordion,
};

function harmonyStyleFor(styleId: string): HarmonyStyleId {
  if (styleId === "ambient") return "ambient";
  if (styleId === "folk" || styleId === "ballad") return "folk";
  if (styleId === "rock") return "pop";
  return "pop";
}

export class Conductor {
  readonly transport: MusicalTransport;
  readonly state: ConductorState;
  readonly latency = new LatencyTracker();
  readonly degradation = new DegradationController();
  private readonly scheduler: LookaheadScheduler<PlannedHit>;
  private mixer: MixerState = defaultMixer();
  private readonly pinned = new Set<InstrumentId>();
  private energyMode: "auto" | EnergyLevel = "auto";
  /** Phase 9: instrument the open/close gestures act on (SWIPE_LEFT/RIGHT cycle). */
  private readonly gestureSelection = new GestureSelection();
  private styleId: string;
  private readonly seed: string;
  private readonly plannedBars = new Set<number>();
  private readonly hotPickups = new Set<number>();
  private readonly chordHistory: Chord[] = [];
  private lastChord: Chord | undefined;
  private obsCount = 0;
  private tickDurations: number[] = [];
  private disposed = false;
  private off: (() => void)[] = [];

  constructor(
    private readonly engines: EngineSet,
    private readonly opts: ConductorOptions,
    private readonly events: EventBus = bus,
  ) {
    this.transport = new MusicalTransport(0);
    this.state = new ConductorState(events);
    this.styleId = styleById(opts.styleId ?? "neutral").id;
    this.seed = opts.seed ?? "conductor";
    const toAudio = opts.toAudioTime ?? ((t: number) => t);
    void toAudio;
    this.scheduler = new LookaheadScheduler<PlannedHit>(
      (hit) => this.dispatch(hit),
      { now: opts.schedulerNow },
    );
    // Transport follows the playback clock; arrangement drains feed the state.
    this.off = [
      events.on("TempoUpdated", (t) => this.transport.setTempo(t.playback)),
      events.on("MeterChanged", (m) => this.transport.setMeter(m)),
      events.on("NoteStarted", (n) => this.maybeHotPickup(n)),
      // Phase 9: vision → arrangement ONLY. applyGesture touches the
      // arrangement queue, energy mode, and gesture selection — never
      // synthesis, never the scheduler fan-out directly.
      events.on("GestureDetected", (g) => this.applyGesture(g.kind)),
    ];
    this.applyMixerToBand();
  }

  dispose(): void {
    this.off.forEach((fn) => fn());
    this.off = [];
    this.state.dispose();
    this.engines.phrases.dispose();
    this.engines.tempo.dispose();
    this.engines.meter.dispose();
    this.engines.key.dispose();
    this.scheduler.stop();
    this.disposed = true;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Swap the output band (lazy AudioContext after a user gesture). */
  setBand(band: Record<InstrumentId, InstrumentEngine>): void {
    (this.opts as { band: Record<InstrumentId, InstrumentEngine> }).band = band;
    this.applyMixerToBand();
  }

  /** Swap the output band and bind live audio clock mappings. */
  setAudioOutput(
    band: Record<InstrumentId, InstrumentEngine>,
    toAudioTime?: (transportSec: number) => number,
    schedulerNow?: () => number,
  ): void {
    (this.opts as { band: Record<InstrumentId, InstrumentEngine> }).band = band;
    if (toAudioTime) this.opts.toAudioTime = toAudioTime;
    if (schedulerNow) {
      this.opts.schedulerNow = schedulerNow;
      this.scheduler.setNow(schedulerNow);
    }
    this.applyMixerToBand();
  }

  reset(originSec: number): void {
    this.transport.reset(originSec);
    this.plannedBars.clear();
    this.hotPickups.clear();
    this.chordHistory.length = 0;
    this.lastChord = undefined;
    this.latency.reset();
    this.degradation.reset();
    this.obsCount = 0;
    this.tickDurations = [];
  }

  // -- input path ---------------------------------------------------------

  /** One raw pitch observation through melody → rhythm → key. */
  pushObservation(obs: PitchObservation): void {
    if (this.disposed) return;
    const deg = this.degradation.snapshot();
    this.obsCount += 1;
    if (deg.observeEvery > 1 && this.obsCount % deg.observeEvery !== 0) return;
    const t0 = Date.now();
    const sm = this.engines.smoother.push(obs);
    this.engines.stabilizer.push(sm);
    this.engines.phrases.tick(obs.timestamp);
    const tempo = this.engines.tempo.tick(obs.timestamp);
    this.engines.meter.evaluate(
      tempo.playback > 0 ? 60 / tempo.playback : 60 / config.rhythm.defaultBpm,
      obs.timestamp / 1000,
    );
    // Theory cadence follows degradation (budget order, 3rd to shed).
    const theoryEvery = deg.theoryEveryBars;
    if (theoryEvery <= 1 || this.obsCount % (theoryEvery * 4) === 0) {
      this.engines.key.tick(obs.timestamp);
    }
    this.state.setDensity(this.engines.tempo.onsetDensity());
    if (obs.confidence > 0 && obs.frequency > 0) this.latency.markVoice(Date.now());
    this.recordTick(Date.now() - t0);
  }

  /** One raw mic RMS sample; Auto mode follows the level (pins survive). */
  pushEnergy(rawRms: number, nowMs: number): void {
    if (this.disposed) return;
    const snap = this.engines.dynamics.push(rawRms, nowMs);
    this.state.setDynamics({ inputEnergy: snap.energy01, smoothedEnergy: snap.energy01, level: snap.level });
    if (this.energyMode !== "auto") return;
    this.applyLevel(snap.level, this.barNow(nowMs / 1000));
  }

  // -- transport tick ------------------------------------------------------

  /**
   * Advance the transport to `nowSec`: drain arrangement queues at bar or
   * phrase boundaries, harmonize + plan ahead, pump the scheduler.
   * Returns the scheduler report plus planned bars (for tests/diagnostics).
   */
  tick(nowSec: number, opts: { phraseBoundary?: boolean } = {}): TickReport & { bars: number[]; degraded: DegradationSnapshot } {
    const t0 = Date.now();
    const tempo = this.engines.tempo.tick(nowSec * 1000);
    this.transport.setTempo(tempo.playback);
    this.state.setDensity(this.engines.tempo.onsetDensity());
    const barFloat = this.transport.barFloatAt(nowSec);
    const applied = this.engines.arrangement.tick(barFloat, { phraseBoundary: opts.phraseBoundary });
    void applied;
    const bars = this.planAhead(nowSec);
    const report = this.scheduler.tick();
    if (report.dispatched > 0) this.latency.markAccompaniment(Date.now());
    const tickAvg = this.recordTick(Date.now() - t0);
    const degraded = this.degradation.evaluate({ lateTotal: this.scheduler.lateTotal, tickAvgMs: tickAvg });
    return { ...report, bars, degraded };
  }

  // -- manual control -------------------------------------------------------

  setEnergyMode(mode: "auto" | EnergyLevel): void {
    this.energyMode = mode;
    if (mode !== "auto") this.applyLevel(mode, this.barNow(this.transport.origin));
  }

  setStyle(id: string): void {
    this.styleId = styleById(id).id;
  }

  getStyleId(): string {
    return this.styleId;
  }

  /** Manual add/remove: quantized + pinned (survives Auto per config). */
  requestInstrument(id: InstrumentId, want: boolean, nowSec: number): void {
    this.pinned.add(id);
    const bpm = this.engines.tempo.state().playback;
    this.engines.arrangement.request(id, want, this.transport.barFloatAt(nowSec), bpm);
  }

  toggleInstrument(id: InstrumentId, nowSec: number): void {
    const active = this.engines.arrangement.snapshot().active[id];
    this.requestInstrument(id, !active, nowSec);
  }

  /**
   * Gesture path (Phase 9, §27–28): one `GestureDetected` → exactly one
   * arrangement-side effect (add/remove selected, energy level/step, or
   * selection step). Quantization rules are inherited: add/remove go
   * through the same quantized `requestInstrument` as manual toggles
   * (pinned, boundary-applied); energy intents reuse `setEnergyMode`.
   * Partial or low-confidence gestures never become bus events, so they
   * can never reach this method.
   */
  applyGesture(kind: GestureKind, nowSec: number = Date.now() / 1000): void {
    // Bus payloads are runtime-unknown: malformed gestures are ignored,
    // never a crash, never a lineup change.
    if (!isGestureKind(kind)) return;
    const intent = gestureToIntent(kind);
    switch (intent.type) {
      case "add-selected":
        this.requestInstrument(this.gestureSelection.current(), true, nowSec);
        break;
      case "remove-selected":
        this.requestInstrument(this.gestureSelection.current(), false, nowSec);
        break;
      case "energy-level":
        this.setEnergyMode(intent.level);
        break;
      case "energy-step": {
        const base =
          this.energyMode !== "auto" ? this.energyMode : this.state.snapshot().dynamics.level;
        const next =
          ENERGY_ORDER[Math.min(2, Math.max(0, ENERGY_ORDER.indexOf(base) + intent.delta))];
        this.setEnergyMode(next);
        break;
      }
      case "select-step":
        this.gestureSelection.step(intent.delta);
        break;
    }
  }

  /** Instrument the open/close gestures currently act on. */
  gestureSelected(): InstrumentId {
    return this.gestureSelection.current();
  }

  setGestureSelected(id: InstrumentId): void {
    this.gestureSelection.set(id);
  }

  unpin(id: InstrumentId): void {
    this.pinned.delete(id);
  }

  pinnedList(): InstrumentId[] {
    return [...this.pinned];
  }

  pendingList(): ReturnType<ArrangementEngine["pendingList"]> {
    return this.engines.arrangement.pendingList();
  }

  setVolume(id: InstrumentId, v: number): void {
    this.mixer = setChannelVolume(this.mixer, id, v);
    this.applyMixerToBand();
  }

  setPan(id: InstrumentId, p: number): void {
    this.mixer = setChannelPan(this.mixer, id, p);
    this.applyMixerToBand();
  }

  toggleMute(id: InstrumentId): void {
    this.mixer = toggleMute(this.mixer, id);
    this.applyMixerToBand();
  }

  toggleSolo(id: InstrumentId): void {
    this.mixer = toggleSolo(this.mixer, id);
    this.applyMixerToBand();
  }

  mixerState(): MixerState {
    return JSON.parse(JSON.stringify(this.mixer)) as MixerState;
  }

  schedulerStats(): { pending: number; lateTotal: number; dispatchedTotal: number } {
    return { pending: this.scheduler.pending, lateTotal: this.scheduler.lateTotal, dispatchedTotal: this.scheduler.dispatchedTotal };
  }

  // -- internals ------------------------------------------------------------

  private barNow(nowSec: number): number {
    return this.transport.barFloatAt(nowSec);
  }

  private applyLevel(level: EnergyLevel, barFloat: number): void {
    const want = new Set<InstrumentId>(ensembleForEnergy(level));
    const bpm = this.engines.tempo.state().playback;
    const snap = this.engines.arrangement.snapshot();
    this.engines.arrangement.setEnergy(densityForEnergy(level));
    for (const id of Object.keys(snap.active) as InstrumentId[]) {
      if (config.conductor.pinHoldsAuto && this.pinned.has(id)) continue;
      if (want.has(id) !== snap.active[id]) this.engines.arrangement.request(id, want.has(id), barFloat, bpm);
    }
  }

  /**
   * Hot drum pickup: the first voice onset in a bar schedules that bar's
   * REMAINING groove immediately (≈ now + 50 ms), so the band answers the
   * voice inside the 250 ms budget instead of waiting for the next
   * downbeat. Drums only — pitch-independent by construction, so it never
   * clashes with the bar's harmony; at most one pickup per bar; skipped
   * when drums are out of the lineup.
   */
  private maybeHotPickup(note: NoteEvent): void {
    if (this.disposed) return;
    if (!Number.isFinite(note.startTime)) return;
    if (!this.engines.arrangement.snapshot().active.drums) return;
    const bar = Math.floor(this.transport.barFloatAt(note.startTime));
    if (bar < 0 || this.hotPickups.has(bar)) return;
    this.hotPickups.add(bar);
    if (this.hotPickups.size > 16) {
      const sorted = [...this.hotPickups].sort((a, b) => a - b);
      for (const old of sorted.slice(0, this.hotPickups.size - 16)) this.hotPickups.delete(old);
    }
    const meter = this.engines.meter.meter();
    const bpm = this.engines.tempo.state().playback;
    const barStart = this.transport.barStartSec(bar);
    const nowAudio = this.opts.schedulerNow ? this.opts.schedulerNow() : note.startTime;
    const toAudio = this.opts.toAudioTime ?? ((t: number) => t);
    const base = Math.max(toAudio(Math.max(note.startTime, barStart)), nowAudio + 0.05);
    const input: PassageInput = {
      chords: [this.lastChord ?? { root: 0 as PitchClass, quality: "major" }],
      melody: [note],
      phraseStarts: [note.startTime],
      meter,
      bpm,
      originSec: barStart,
      energy01: this.engines.dynamics.snapshot().energy01,
      density: this.engines.tempo.onsetDensity(),
      style: styleDrums(this.styleId),
    };
    const remaining = planDrums(input, 1)
      .filter((h) => h.note.startTime >= note.startTime - 1e-6)
      .slice(0, 8);
    if (remaining.length === 0) return;
    this.scheduler.push(
      remaining.map((h) => ({
        audioTime: base + Math.max(0, h.note.startTime - note.startTime),
        bar,
        events: [{ ...h, bar }],
      })),
    );
    // Dispatch synchronously: the pickup answers the voice on this frame
    // (no waiting for the 50 ms transport tick). `dispatch` already
    // isolates throwing consumers, so this is safe inside the NoteStarted
    // emission.
    const rep = this.scheduler.tick();
    if (rep.dispatched > 0) this.latency.markAccompaniment(Date.now());
  }

  private planAhead(nowSec: number): number[] {
    const meter = this.engines.meter.meter();
    this.transport.setMeter(meter);
    const bpm = this.engines.tempo.state().playback;
    const barFloat = this.transport.barFloatAt(nowSec);
    const currentBar = Math.floor(barFloat);
    const planned: number[] = [];
    const toAudio = this.opts.toAudioTime ?? ((t: number) => t);
    for (let b = currentBar; b < currentBar + config.conductor.planAheadBars; b++) {
      if (this.plannedBars.has(b)) continue;
      if (b < 0) continue;
      const chord = this.harmonizeBar(b, nowSec);
      const input = this.passageInput(chord, b, bpm, meter);
      const active = this.engines.arrangement.snapshot().active;
      const degraded = this.degradation.snapshot();
      const events: MusicalEvent[] = [];
      for (const id of Object.keys(active) as InstrumentId[]) {
        if (!active[id]) continue;
        // Minimal mode never silences: drums + bass always render.
        if (degraded.level === "minimal" && id !== "drums" && id !== "bass") continue;
        events.push(...PLAN_OF[id](input, 1).map((e) => ({ ...e, bar: b })));
      }
      const barStartTransport = this.transport.barStartSec(b);
      // Never stamp "now": the scheduler samples its clock fresh at dispatch,
      // so a now-stamped item reads ms old and counts late. +20 ms is
      // inaudible and absorbs the planner/dispatch skew (grace: scheduler).
      const audioTime = toAudio(Math.max(barStartTransport, nowSec + 0.02));
      this.scheduler.push([{ audioTime, bar: b, events }]);
      this.plannedBars.add(b);
      planned.push(b);
      // Bound the planned set (soak-safe): forget bars far behind.
      if (this.plannedBars.size > 16) {
        const sorted = [...this.plannedBars].sort((x, y) => x - y);
        for (const old of sorted.slice(0, this.plannedBars.size - 16)) this.plannedBars.delete(old);
      }
    }
    return planned;
  }

  private harmonizeBar(bar: number, nowSec: number): Chord {
    const key = this.engines.key.estimate() ?? this.state.currentKey();
    const scaleId = scaleIdForKey(key);
    const barStart = this.transport.barStartSec(bar);
    const barEnd = barStart + this.transport.barSec();
    const slice = this.state.melodyNotes().filter((n) => n.startTime >= barStart && n.startTime < barEnd);
    const phrases = this.state.phraseRecords();
    const phrasePosition = this.phrasePositionFor(barStart, barEnd, phrases);
    const style = harmonyStyleFor(this.styleId);
    const theoryEvery = this.degradation.snapshot().theoryEveryBars;
    const shouldReestimate = bar % Math.max(1, theoryEvery) === 0 || this.lastChord === undefined;
    if (!shouldReestimate && this.lastChord) return this.lastChord;
    const { chord, confidence } = chooseChordForBar({
      key,
      scaleId,
      melodySlice: slice,
      barIndex: bar,
      phrasePosition,
      style,
      prevChord: this.lastChord,
      recentChords: [...this.chordHistory],
      seed: `${this.seed}-bar${bar}-${this.styleId}`,
    });
    this.lastChord = chord;
    this.chordHistory.push(chord);
    if (this.chordHistory.length > 16) this.chordHistory.splice(0, this.chordHistory.length - 16);
    const event: ChordEvent = {
      id: newId("chord"),
      chord,
      startBar: bar,
      durationBars: 1,
      confidence,
    };
    this.events.emit("ChordChanged", event);
    void nowSec;
    return chord;
  }

  private phrasePositionFor(barStart: number, barEnd: number, phrases: { startTime: number; endTime: number | null }[]): PhrasePosition {
    for (const p of phrases) {
      if (p.startTime >= barStart && p.startTime < barEnd) return "start";
      if (p.endTime !== null && p.endTime >= barStart && p.endTime < barEnd) return "end";
    }
    return "middle";
  }

  private passageInput(chord: Chord, bar: number, bpm: number, meter: TimeSignature): PassageInput {
    const barStart = this.transport.barStartSec(bar);
    const barEnd = barStart + this.transport.barSec();
    const melody = this.state.melodyNotes().filter((n) => n.startTime < barEnd + this.transport.barSec() * 2);
    const phraseStarts = this.state.phraseRecords().map((p) => p.startTime);
    const energy = this.engines.dynamics.snapshot().energy01;
    return {
      chords: [chord],
      melody: melody.length > 0 ? melody : this.placeholderMelody(barStart, bpm),
      phraseStarts: phraseStarts.length > 0 ? phraseStarts : [barStart],
      meter,
      bpm,
      originSec: barStart,
      energy01: energy,
      density: this.engines.tempo.onsetDensity(),
      style: styleDrums(this.styleId),
    };
  }

  private placeholderMelody(barStart: number, bpm: number): NoteEvent[] {
    void bpm;
    // No voice yet: a silent placeholder keeps planners total (violin stays
    // silent off phrase starts; pitched planners voice the chord).
    return [];
  }

  private dispatch(hit: PlannedHit): void {
    const tempo: TempoState = this.engines.tempo.state();
    const meter: TimeSignature = this.engines.meter.meter();
    const byEngine = new Map<InstrumentId, MusicalEvent[]>();
    for (const e of hit.events) {
      const list = byEngine.get(e.instrument) ?? [];
      list.push(e);
      byEngine.set(e.instrument, list);
    }
    for (const [id, evts] of byEngine) {
      const engine = this.opts.band[id];
      if (!engine) continue;
      // Apply fadeGain at entries: scale velocity over the fade window.
      engine.schedule(evts, { audioTime: hit.audioTime, tempo, meter });
    }
  }

  private applyMixerToBand(): void {
    for (const id of Object.keys(this.opts.band) as InstrumentId[]) {
      this.opts.band[id]?.setVolume(effectiveVolume(this.mixer, id));
      const ch = (this.mixer as Record<string, { pan: number }>)[id];
      if (ch) this.opts.band[id]?.setPan(ch.pan);
    }
  }

  private recordTick(ms: number): number {
    const v = Number.isFinite(ms) && ms >= 0 ? ms : 0;
    this.tickDurations.push(v);
    if (this.tickDurations.length > 120) this.tickDurations.splice(0, this.tickDurations.length - 120);
    const sorted = [...this.tickDurations].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.5 * sorted.length) - 1));
    return sorted.length === 0 ? 0 : sorted[idx];
  }
}

export type { PhrasePosition };
export type { EnergyLevel };
