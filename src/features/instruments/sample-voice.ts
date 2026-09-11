/**
 * SampleVoice (Phase 16, TDR-16). A `VoiceSink` beside `WebAudioSink` with the
 * same usage interface (`tone({freq, at, dur, velocity})`): pitched notes play
 * the nearest sample via `AudioBufferSourceNode` (+ `playbackRate` retune
 * within ±2 st) with the existing release envelope; drums play one-shots.
 * Anything missing or failing (no pack, no buffer, |detune| > budget,
 * network, decode, unknown voice) delegates to the inner procedural
 * `WebAudioSink` — no click, no exception, no silence.
 *
 * No AudioContext is touched at import time. No URLs here — packs live in
 * `packs/` and arrive as arguments.
 */
import { config } from "@/lib/config";
import { WebAudioSink, type NoiseParams, type ToneParams, type VoiceSink } from "./audio-sink";
import { freqToMidi, selectSample, type SampleCache } from "./sample-cache";
import { DRUMS_PACK } from "./packs/drums";
import { PIANO_PACK } from "./packs/piano";
import { VIOLAO_PACK } from "./packs/violao";
import type { DrumPackManifest, PitchedPackManifest } from "./packs/types";
import { isSampleEnabled } from "./sample-store";

export interface SampleVoiceOpts {
  pitchedPack?: PitchedPackManifest;
  drumPack?: DrumPackManifest;
  cache: SampleCache;
  fallback: VoiceSink;
  useSamples: boolean;
  /**
   * Live toggle (per-note). When present it overrides the construction-time
   * `useSamples` so the real/synth switch applies instantly without
   * rebuilding the audio graph. Defaults to the static flag (tests).
   */
  enabled?: () => boolean;
}

/** Config preference for an instrument id (`guitar` stays synth: false). */
export function shouldUseSamples(id: string): boolean {
  const samples = (config.instruments.samples as unknown as Record<string, { useSamples?: boolean } | undefined>);
  return samples[id]?.useSamples === true;
}

function drumUrlFor(pack: DrumPackManifest, voice: string): string | null {
  const hit = pack.voices.find((v) => v.voice === voice);
  return hit ? hit.url : null;
}

/**
 * Reverse lookup: EngineBase renders each drum voice with exactly the recipe
 * from `config.instruments.drumVoices`, so (filterType, filterFreq) identifies
 * the voice with no new constants. Unknown combos → null (synth fallback).
 */
export function inferDrumVoice(p: NoiseParams): string | null {
  const recipes = config.instruments.drumVoices as Record<
    string,
    { filterType: string; filterFreq: number }
  >;
  for (const voice of Object.keys(recipes)) {
    const r = recipes[voice];
    if (r.filterType === p.filterType && r.filterFreq === p.filterFreq) return voice;
  }
  return null;
}

export class SampleVoice implements VoiceSink {
  private readonly out: GainNode;
  private readonly pan: StereoPannerNode | null;
  private readonly live: AudioScheduledSourceNode[] = [];
  private pendingTone: ToneParams | null = null;
  private disposed = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    master: AudioNode,
    private readonly opts: SampleVoiceOpts,
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

  get fallback(): VoiceSink {
    return this.opts.fallback;
  }

  private isEnabled(): boolean {
    try {
      return this.opts.enabled ? this.opts.enabled() : this.opts.useSamples;
    } catch {
      return this.opts.useSamples;
    }
  }

  tone(p: ToneParams): void {
    if (this.disposed) return;
    // Drum mode: hold the membrane tone; the paired noise() decides
    // one-shot vs synth so a hit never double-triggers.
    if (this.opts.drumPack && this.isEnabled()) {
      try {
        if (this.pendingTone) {
          const stale = this.pendingTone;
          this.pendingTone = null;
          this.opts.fallback.tone(stale);
        }
        this.pendingTone = { ...p };
        return;
      } catch {
        this.pendingTone = null;
        this.safeFallbackTone(p);
        return;
      }
    }
    if (!this.opts.useSamples || !this.opts.pitchedPack) {
      this.safeFallbackTone(p);
      return;
    }
    try {
      if (!this.isEnabled()) {
        this.safeFallbackTone(p);
        return;
      }
      const midi = Math.round(freqToMidi(p.freq));
      const sel = selectSample(midi, this.opts.pitchedPack);
      const buf = sel ? this.opts.cache.get(sel.note.url) : null;
      if (!sel || !buf) {
        this.safeFallbackTone(p);
        return;
      }
      this.playBuffer(buf, {
        at: p.at,
        dur: p.dur,
        velocity: p.velocity,
        attack: p.attack,
        release: p.release,
        rate: sel.rate,
      });
    } catch {
      this.safeFallbackTone(p);
    }
  }

  noise(p: NoiseParams): void {
    if (this.disposed) return;
    if (!this.opts.useSamples || !this.opts.drumPack || !this.isEnabled()) {
      this.flushPendingTone();
      this.safeFallbackNoise(p);
      return;
    }
    try {
      const voice = inferDrumVoice(p);
      const url = voice ? drumUrlFor(this.opts.drumPack, voice) : null;
      const buf = url ? this.opts.cache.get(url) : null;
      if (!voice || !url || !buf) {
        // No sample: replay the held membrane (if any) + synth noise so the
        // output is exactly today's sound.
        this.flushPendingTone();
        this.safeFallbackNoise(p);
        return;
      }
      // One-shot replaces the membrane+noise pair: drop the held tone.
      this.pendingTone = null;
      const dur = Math.max(p.dur, 0.05);
      this.playBuffer(buf, {
        at: p.at,
        dur,
        velocity: p.velocity,
        attack: 0.002,
        release: Math.min(dur * 0.6, 0.2),
        rate: 1,
      });
    } catch {
      this.flushPendingTone();
      this.safeFallbackNoise(p);
    }
  }

  cancel(): void {
    this.pendingTone = null;
    const live = this.live.splice(0, this.live.length);
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
    try {
      this.opts.fallback.cancel();
    } catch {
      // Fallback cancel never breaks silence.
    }
  }

  setVolume(v: number): void {
    if (this.disposed) return;
    const c = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    try {
      this.out.gain.setTargetAtTime(c * 0.9, this.ctx.currentTime, 0.015);
    } catch {
      // Headless mocks may lack automation — fallback still gets the level.
    }
    try {
      this.opts.fallback.setVolume(v);
    } catch {
      // Never break the mixer.
    }
  }

  setPan(p: number): void {
    if (this.disposed || !this.pan) {
      try {
        this.opts.fallback.setPan(p);
      } catch {
        // Never break the mixer.
      }
      return;
    }
    const c = Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0;
    try {
      this.pan.pan.setTargetAtTime(c, this.ctx.currentTime, 0.015);
    } catch {
      // Keep going — fallback still pans.
    }
    try {
      this.opts.fallback.setPan(p);
    } catch {
      // Never break the mixer.
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    try {
      this.out.disconnect();
    } catch {
      // Already gone.
    }
    try {
      this.opts.fallback.dispose();
    } catch {
      // Already gone.
    }
  }

  private playBuffer(
    buf: AudioBuffer,
    o: { at: number; dur: number; velocity: number; attack: number; release: number; rate: number },
  ): void {
    const at = Math.max(o.at, this.ctx.currentTime);
    const dur = Math.max(o.dur, 0.03);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate;
    const g = this.ctx.createGain();
    const peak = Math.max(0, Math.min(1, o.velocity));
    const attack = Math.max(o.attack, 0.002);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0001), at + attack);
    const relStart = Math.max(at + attack, at + dur - o.release);
    g.gain.setValueAtTime(Math.max(peak, 0.0001), relStart);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + o.release);
    src.connect(g);
    g.connect(this.out);
    const stopAt = at + dur + o.release + 0.05;
    src.start(at);
    try {
      src.stop(stopAt);
    } catch {
      // Very short buffers stop themselves.
    }
    this.live.push(src);
    if (this.live.length > 256) this.live.splice(0, this.live.length - 256);
    src.onended = () => {
      const i = this.live.indexOf(src);
      if (i >= 0) this.live.splice(i, 1);
    };
  }

  private flushPendingTone(): void {
    if (!this.pendingTone) return;
    const pending = this.pendingTone;
    this.pendingTone = null;
    this.safeFallbackTone(pending);
  }

  private safeFallbackTone(p: ToneParams): void {
    try {
      this.opts.fallback.tone(p);
    } catch {
      // A single voice must never break the band.
    }
  }

  private safeFallbackNoise(p: NoiseParams): void {
    try {
      this.opts.fallback.noise(p);
    } catch {
      // Same guarantee as tone().
    }
  }
}

/**
 * Per-instrument wiring (piano → violão → bateria): preference from
 * `config.instruments.samples.<id>.useSamples`; without a cache the result
 * is a plain procedural sink (fallback invisible, zero behavior change).
 * The live real/synth toggle is read per-note from `sample-store` flags so
 * the switch applies instantly; downloads apply live through the shared
 * cache (buffers appear → subsequent notes play them, no rebuild).
 */
export function createInstrumentSink(
  ctx: BaseAudioContext,
  master: AudioNode,
  instrumentId: string,
  cache: SampleCache | null,
  makeFallback: (ctx: BaseAudioContext, master: AudioNode) => VoiceSink = (c, m) => new WebAudioSink(c, m),
): VoiceSink {
  const fallback = makeFallback(ctx, master);
  if (!cache || !shouldUseSamples(instrumentId)) return fallback;
  try {
    if (instrumentId === "piano") {
      return new SampleVoice(ctx, master, {
        pitchedPack: PIANO_PACK, cache, fallback, useSamples: true,
        enabled: () => safeFlag("piano"),
      });
    }
    if (instrumentId === "violao") {
      return new SampleVoice(ctx, master, {
        pitchedPack: VIOLAO_PACK, cache, fallback, useSamples: true,
        enabled: () => safeFlag("violao"),
      });
    }
    if (instrumentId === "drums") {
      return new SampleVoice(ctx, master, {
        drumPack: DRUMS_PACK, cache, fallback, useSamples: true,
        enabled: () => safeFlag("drums"),
      });
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function safeFlag(id: "piano" | "violao" | "drums"): boolean {
  try {
    return isSampleEnabled(id);
  } catch {
    return true;
  }
}
