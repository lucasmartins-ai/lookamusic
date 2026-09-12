/**
 * EngineBase — shared `InstrumentEngine` implementation (Phase 6, §23–24).
 * One file per instrument still exists (the architecture acceptance pins
 * that); each is a thin plan + timbre + factory over this base. No
 * conductor/engine edits are ever needed for a new instrument: add the file,
 * add one registry row.
 */
import { config } from "@/lib/config";
import type { InstrumentId } from "@/domain/types";
import type { DrumVoice } from "@/features/music/rhythm/patterns";
import type { NoiseAttackSpec, PartialSpec, VoiceSink } from "./audio-sink";
import {
  beatToAudioTime,
  clampPan,
  clampVolume,
  midiToFreq,
  type InstrumentEngine,
  type MusicalEvent,
  type ScheduleContext,
} from "./types";

export interface PitchedTimbre {
  kind: "pitched";
  osc: OscillatorType;
  cutoff: number;
  attack: number;
  release: number;
  detune: number;
  octaveGain: number;
  /** Native additive model (absent = the plain oscillator path). */
  partials?: readonly PartialSpec[];
  noiseAttack?: NoiseAttackSpec;
  brightnessPerOctave?: number;
}

/** Native model entry (`config.instruments.nativeModels`), all optional. */
export interface NativePitchedModel {
  partials?: readonly PartialSpec[];
  noiseAttack?: NoiseAttackSpec;
  brightnessPerOctave?: number;
}

/** Drum body modes per voice (`config.instruments.nativeModels.drums`). */
export interface NativeDrumModel {
  partials?: readonly PartialSpec[];
}

export interface DrumTimbre {
  kind: "drums";
}

export type EngineTimbre = PitchedTimbre | DrumTimbre;

/** GM percussion number → drum voice (inverse of `config.instruments.drumGm`). */
export function gmToVoice(midi: number): DrumVoice | null {
  const gm = config.instruments.drumGm as Record<string, number>;
  for (const voice of Object.keys(gm)) {
    if (gm[voice] === Math.round(midi)) return voice as DrumVoice;
  }
  return null;
}

export class EngineBase implements InstrumentEngine {
  readonly id: InstrumentId;
  private volume = 0.9;
  private pan = 0;

  constructor(
    id: InstrumentId,
    private readonly sink: VoiceSink,
    private readonly timbre: EngineTimbre,
  ) {
    this.id = id;
  }

  schedule(events: MusicalEvent[], ctx: ScheduleContext): void {
    const bpm = ctx.tempo.playback;
    for (const e of events) {
      if (!e || !e.note) continue; // never crash on a malformed event
      if (e.instrument !== this.id) continue;
      const at = beatToAudioTime(ctx.audioTime, e.beat, bpm);
      if (!Number.isFinite(at)) continue;
      if (this.timbre.kind === "drums") this.renderDrum(e.note.midi, at, e.note.velocity);
      else this.renderTone(e.note.midi, at, e.note.duration, e.note.velocity);
    }
  }

  stop(): void {
    this.sink.cancel();
  }

  setVolume(v: number): void {
    this.volume = clampVolume(v);
    this.sink.setVolume(this.volume);
  }

  setPan(p: number): void {
    this.pan = clampPan(p);
    this.sink.setPan(this.pan);
  }

  get currentVolume(): number {
    return this.volume;
  }

  get currentPan(): number {
    return this.pan;
  }

  private renderTone(midi: number, at: number, durSec: number, velocity: number): void {
    const t = this.timbre as PitchedTimbre;
    this.sink.tone({
      freq: midiToFreq(Math.max(0, Math.min(127, Math.round(midi)))),
      at,
      dur: Math.max(durSec, 0.05),
      velocity,
      type: t.osc,
      attack: t.attack,
      release: t.release,
      cutoff: t.cutoff,
      detune: t.detune,
      octaveGain: t.octaveGain,
      partials: t.partials,
      noiseAttack: t.noiseAttack,
      brightnessPerOctave: t.brightnessPerOctave,
    });
  }

  private renderDrum(midi: number, at: number, velocity: number): void {
    const voice = gmToVoice(midi);
    if (!voice) return; // unknown percussion code: skip, never crash
    const recipe = config.instruments.drumVoices[voice];
    if (recipe.membraneFrom > 0) {
      this.sink.tone({
        freq: recipe.membraneFrom,
        freqEnd: recipe.membraneTo > 0 ? recipe.membraneTo : undefined,
        at,
        dur: Math.min(recipe.durSec, 0.25),
        velocity,
        type: "sine",
        attack: 0.002,
        release: 0.08,
        cutoff: recipe.filterFreq * 4,
        partials: drumBodyOf(voice),
      });
    }
    this.sink.noise({
      at,
      dur: recipe.durSec,
      // Hotfix som limpo: o ruído em vozes com membrana (kick/tom/cajon)
      // é só ataque — corpo vem do sweep senoidal. Antes 0.6 sujava o grave.
      velocity: recipe.membraneFrom > 0 ? velocity * 0.35 : velocity,
      filterType: recipe.filterType as BiquadFilterType,
      filterFreq: recipe.filterFreq,
    });
  }
}

/**
 * Hotfix modelos nativos: additive model for `key`, when one exists.
 * Everything is optional — an instrument without a native model keeps the
 * old single-oscillator timbre byte-for-byte.
 */
export function nativeModelOf(key: string): NativePitchedModel {
  const models = config.instruments.nativeModels as unknown as Record<
    string,
    NativePitchedModel | undefined
  >;
  return models[key] ?? {};
}

/** Drum body modes for `voice` (empty when the voice has no native model). */
export function drumBodyOf(voice: string): readonly PartialSpec[] | undefined {
  const drums = config.instruments.nativeModels.drums as unknown as Record<
    string,
    NativeDrumModel | undefined
  >;
  return drums[voice]?.partials;
}

/** Timbre recipe straight from `config.instruments.timbre` (no copies). */
export function pitchedTimbreOf(key: keyof typeof config.instruments.timbre): PitchedTimbre {
  const r = config.instruments.timbre[key];
  const model = nativeModelOf(key);
  return {
    kind: "pitched",
    osc: r.osc as OscillatorType,
    cutoff: r.cutoff,
    attack: r.attack,
    release: r.release,
    detune: r.detune,
    octaveGain: r.octaveGain,
    partials: model.partials,
    noiseAttack: model.noiseAttack,
    brightnessPerOctave: model.brightnessPerOctave,
  };
}
