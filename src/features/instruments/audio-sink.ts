/**
 * VoiceSink — the single seam between engines and sound (Phase 6, §24).
 * Engines call `tone`/`noise`; tests inject a fake, the browser injects
 * `WebAudioSink` (oscillators + filtered noise + envelopes, zero samples).
 * No AudioContext is touched at import time — safe for SSR and Node tests.
 */
import { config } from "@/lib/config";

export interface ToneParams {
  freq: number;
  /** Absolute AudioContext seconds. */
  at: number;
  dur: number;
  velocity: number;
  type: OscillatorType;
  attack: number;
  release: number;
  cutoff?: number;
  /** Cents, applied as a second detuned oscillator (musette/strings). */
  detune?: number;
  /** 0–1 gain of an octave-up shimmer oscillator (piano bite, e-guitar). */
  octaveGain?: number;
  /** Optional pitch sweep target (kick/tom membranes). */
  freqEnd?: number;
  /**
   * Hotfix modelos nativos: additive partial stack replacing the single
   * oscillator. Each partial rings with its own decay, which is what makes
   * piano/violão read as instruments instead of oscillators — entirely
   * procedural, no assets, no download.
   */
  partials?: readonly PartialSpec[];
  /** Native-model transient (hammer/nail/hand) layered on the stack. */
  noiseAttack?: NoiseAttackSpec;
  /** Lowpass tracking per octave above A4 (0 = fixed cutoff). */
  brightnessPerOctave?: number;
}

/** One additive partial of a native instrument model. */
export interface PartialSpec {
  /** Frequency multiplier vs. the fundamental (1 = fundamental). */
  ratio: number;
  /** Relative gain (0–1) before the note velocity is applied. */
  gain: number;
  /** Ring time constant in seconds (per-partial decay). */
  decaySec: number;
}

/** Short noise burst at the note attack (hammer, nail, stick). */
export interface NoiseAttackSpec {
  durSec: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  gain: number;
}

export interface NoiseParams {
  /** Absolute AudioContext seconds. */
  at: number;
  dur: number;
  velocity: number;
  filterType: BiquadFilterType;
  filterFreq: number;
}

export interface VoiceSink {
  tone(p: ToneParams): void;
  noise(p: NoiseParams): void;
  /** Silence now: cancel scheduled voices. `stop()` on the engine lands here. */
  cancel(): void;
  setVolume(v: number): void;
  setPan(p: number): void;
  dispose(): void;
}

/**
 * Hotfix som limpo: barramento master compartilhado (um por AudioContext).
 * Ganho de entrada contido + compressor suave colam a banda e evitam o
 * clipping de 9 instrumentos em 0.9; um send curto de reverb procedural
 * (IR sintética, sem assets) tira o som "seco/plástico". Chamado só no
 * browser (e no OfflineAudioContext do export); nunca no import.
 */
export interface MasterBus {
  /** Nó de entrada: os VoiceSinks conectam aqui, não no destination. */
  input: GainNode;
  dispose(): void;
}

function roomImpulse(ctx: BaseAudioContext, durSec: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function createMasterBus(ctx: BaseAudioContext, destination: AudioNode): MasterBus {
  const input = ctx.createGain();
  input.gain.value = 0.8;
  // Ambientes sem Dynamics/Convolver (mocks, webviews antigas): som segue
  // limpo em gain direto em vez de quebrar a banda.
  const factory = ctx as unknown as {
    createDynamicsCompressor?: () => DynamicsCompressorNode;
    createConvolver?: () => ConvolverNode;
  };
  try {
    const makeComp = factory.createDynamicsCompressor?.bind(ctx);
    if (makeComp) {
      const comp = makeComp();
      comp.threshold.value = -18;
      comp.knee.value = 20;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      input.connect(comp);
      comp.connect(destination);
    } else {
      input.connect(destination);
    }
  } catch {
    try {
      input.connect(destination);
    } catch {
      // Sem saída — nunca quebra o chamador.
    }
  }
  try {
    const makeVerb = factory.createConvolver?.bind(ctx);
    if (makeVerb) {
      const verb = makeVerb();
      verb.buffer = roomImpulse(ctx, 1.4, 2.2);
      const wet = ctx.createGain();
      wet.gain.value = 0.14;
      input.connect(verb);
      verb.connect(wet);
      wet.connect(destination);
    }
  } catch {
    // Sem sala, a banda segue comprimida — nunca quebra o som.
  }
  return {
    input,
    dispose: () => {
      try {
        input.disconnect();
      } catch {
        // Já desconectado.
      }
    },
  };
}

function envGain(
  ctx: BaseAudioContext,
  at: number,
  dur: number,
  velocity: number,
  attack: number,
  release: number,
): GainNode {
  const g = ctx.createGain();
  const peak = Math.max(0, Math.min(1, velocity));
  const a0 = Math.max(at, 0);
  g.gain.setValueAtTime(0.0001, a0);
  g.gain.linearRampToValueAtTime(Math.max(peak, 0.0001), a0 + Math.max(attack, 0.002));
  const relStart = Math.max(a0 + Math.max(attack, 0.002), a0 + dur - release);
  g.gain.setValueAtTime(Math.max(peak, 0.0001), relStart);
  g.gain.exponentialRampToValueAtTime(0.0001, a0 + dur + release);
  return g;
}

/**
 * Browser sink: one GainNode (+StereoPanner when available) per engine, so
 * mixer volume/pan ride the node params and `cancel` keeps future bars clean.
 * Late/overlapping tones are the scheduler's problem, never a crash here.
 */
export class WebAudioSink implements VoiceSink {
  private readonly out: GainNode;
  private readonly pan: StereoPannerNode | null;
  private noiseBuf: AudioBuffer | null = null;
  private live: AudioScheduledSourceNode[] = [];
  private disposed = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly master: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    if (typeof ctx.createStereoPanner === "function") {
      this.pan = ctx.createStereoPanner();
      this.out.connect(this.pan);
      this.pan.connect(master);
    } else {
      this.pan = null;
      this.out.connect(master);
    }
  }

  tone(p: ToneParams): void {
    if (this.disposed) return;
    try {
      const at = Math.max(p.at, this.ctx.currentTime);
      const dur = Math.max(p.dur, 0.03);
      if (p.partials && p.partials.length > 0) {
        this.renderModel(p, at, dur);
        return;
      }
      const cutoff = p.cutoff ?? config.instruments.timbre.piano.cutoff;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      const eg = envGain(this.ctx, at, dur, p.velocity, p.attack, p.release);
      filter.connect(eg);
      eg.connect(this.out);
      const osc = this.ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.setValueAtTime(Math.max(p.freq, 1), at);
      if (p.freqEnd && p.freqEnd > 0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(p.freqEnd, 1), at + Math.min(dur, 0.2));
      }
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + dur + p.release + 0.05);
      this.track(osc);
      const detune = p.detune ?? 0;
      if (detune !== 0) {
        const osc2 = this.ctx.createOscillator();
        osc2.type = p.type;
        osc2.frequency.value = Math.max(p.freq, 1);
        osc2.detune.value = detune;
        osc2.connect(filter);
        osc2.start(at);
        osc2.stop(at + dur + p.release + 0.05);
        this.track(osc2);
      }
      const oct = p.octaveGain ?? 0;
      if (oct > 0) {
        const og = this.ctx.createGain();
        og.gain.value = oct * 0.5;
        const osc3 = this.ctx.createOscillator();
        osc3.type = p.type;
        osc3.frequency.value = Math.max(p.freq, 1) * 2;
        osc3.connect(og);
        og.connect(filter);
        osc3.start(at);
        osc3.stop(at + dur + p.release + 0.05);
        this.track(osc3);
      }
    } catch {
      // A single voice must never break the band (diagnostics count it upstream).
    }
  }

  noise(p: NoiseParams): void {
    if (this.disposed) return;
    try {
      const at = Math.max(p.at, this.ctx.currentTime);
      const dur = Math.max(p.dur, 0.03);
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer();
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = p.filterType;
      filter.frequency.value = p.filterFreq;
      const eg = envGain(this.ctx, at, dur, p.velocity, 0.002, Math.min(dur * 0.6, 0.2));
      src.connect(filter);
      filter.connect(eg);
      eg.connect(this.out);
      src.start(at);
      src.stop(at + dur + 0.25);
      this.track(src);
    } catch {
      // Same guarantee as tone().
    }
  }

  cancel(): void {
    const live = this.live;
    this.live = [];
    for (const n of live) {
      try {
        n.stop();
      } catch {
        // Already stopped — the silence we wanted anyway.
      }
      try {
        n.disconnect();
      } catch {
        // Already gone.
      }
    }
  }

  setVolume(v: number): void {
    if (this.disposed) return;
    const c = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    this.out.gain.setTargetAtTime(c * 0.9, this.ctx.currentTime, 0.015);
  }

  setPan(p: number): void {
    if (this.disposed || !this.pan) return;
    const c = Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0;
    this.pan.pan.setTargetAtTime(c, this.ctx.currentTime, 0.015);
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    try {
      this.out.disconnect();
    } catch {
      // Already gone.
    }
  }

  /**
   * Hotfix modelos nativos: additive model voice. Partials share one lowpass
   * (brightness tracks the note) and each one decays on its own; the optional
   * noise transient gives the instrument its attack. Falls back to silence
   * (never throws) when a malformed partial arrives.
   */
  private renderModel(p: ToneParams, at: number, dur: number): void {
    const partials = p.partials ?? [];
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.modelCutoff(p);
    filter.connect(this.out);
    const peak = Math.max(0, Math.min(1, p.velocity));
    const attack = Math.max(p.attack, 0.002);
    for (const part of partials) {
      const freq = Math.max(p.freq, 1) * part.ratio;
      if (!Number.isFinite(freq) || freq <= 0) continue;
      const ring = Math.max(part.decaySec, dur);
      const level = Math.max(peak * part.gain, 0.0001);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(level, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + attack + ring);
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, at);
      // Membrana afinada (kick/tom/cajon): o sweep de afinação vale para o
      // fundamental e para cada parcial na mesma proporção — sem isso o corpo
      // harmônico mataria o "bump" do bumbo.
      if (p.freqEnd && p.freqEnd > 0 && freq > 0) {
        const ratio = p.freqEnd / Math.max(p.freq, 1);
        const target = Math.max(freq * ratio, 1);
        osc.frequency.exponentialRampToValueAtTime(target, at + Math.min(dur, 0.2));
      }
      osc.connect(g);
      g.connect(filter);
      osc.start(at);
      osc.stop(at + attack + ring + 0.05);
      this.track(osc);
    }
    if (p.noiseAttack && p.noiseAttack.gain > 0) {
      this.renderNoiseAttack(p.noiseAttack, at, peak, filter);
    }
  }

  private modelCutoff(p: ToneParams): number {
    const base = p.cutoff ?? config.instruments.timbre.piano.cutoff;
    const perOctave = p.brightnessPerOctave ?? 0;
    if (!(perOctave > 0)) return base;
    const rel = Math.log2(Math.max(p.freq, 1) / 440);
    const factor = Math.pow(2, Math.max(-1, Math.min(1, perOctave * rel)));
    return Math.max(200, Math.min(12000, base * factor));
  }

  private renderNoiseAttack(
    spec: NoiseAttackSpec,
    at: number,
    velocity: number,
    dest: AudioNode,
  ): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer();
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = spec.filterType;
    filter.frequency.value = spec.filterFreq;
    const g = this.ctx.createGain();
    const level = Math.max(velocity * spec.gain, 0.0001);
    const dur = Math.max(spec.durSec, 0.005);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(at);
    src.stop(at + dur + 0.02);
    this.track(src);
  }

  private buffer(): AudioBuffer {
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private track(n: AudioScheduledSourceNode): void {
    this.live.push(n);
    if (this.live.length > 256) this.live.splice(0, this.live.length - 256);
    n.onended = () => {
      const i = this.live.indexOf(n);
      if (i >= 0) this.live.splice(i, 1);
    };
  }
}
