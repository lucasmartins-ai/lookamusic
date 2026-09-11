/**
/**
 * Composition Player — real-time Web Audio playback & auditioning for the Editor.
 * Voices melody + band accompaniment bit-faithfully from a Composition model.
 */
import { config } from "@/lib/config";
import {
  INSTRUMENTS,
  type Chord,
  type Composition,
  type InstrumentId,
  type PitchClass,
} from "@/domain/types";
import { WebAudioSink, createMasterBus } from "@/features/instruments/audio-sink";
import { createBand } from "@/features/instruments/registry";
import { barQuarters, METER_44 } from "@/features/music/rhythm/meter";
import {
  planAccordion,
  planBass,
  planDrums,
  planGuitar,
  planPiano,
  planSax,
  planStrings,
  planViolao,
  planViolin,
  type PassageInput,
} from "@/features/instruments/planning";
import { styleDrums } from "@/features/music/arrangement/presets";
import { midiToFreq } from "@/features/pitch/conversions";
import type { InstrumentEngine, MusicalEvent } from "@/features/instruments/types";

const PLAN_OF: Record<InstrumentId, (input: PassageInput, bars: number) => MusicalEvent[]> = {
  drums: planDrums,
  bass: planBass,
  piano: planPiano,
  guitar: planGuitar,
  violao: planViolao,
  strings: planStrings,
  violin: planViolin,
  sax: planSax,
  accordion: planAccordion,
};

export class CompositionPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private band: Record<InstrumentId, InstrumentEngine> | null = null;
  private melodySink: WebAudioSink | null = null;
  private isPlaying = false;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private playStartAudioTime = 0;
  private playDurationSec = 0;

  private ensureAudio(): boolean {
    if (typeof window === "undefined") return false;
    const AC = window.AudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      this.ctx = new AC({ latencyHint: "interactive" } as AudioContextOptions);
      this.master = createMasterBus(this.ctx, this.ctx.destination).input;
      const liveCtx = this.ctx;
      const liveMaster = this.master;
      this.band = createBand(() => new WebAudioSink(liveCtx, liveMaster));
      this.melodySink = new WebAudioSink(liveCtx, liveMaster);
      this.melodySink.setVolume(0.95);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return true;
  }

  /**
   * Preview a single note instantly (for timeline clicking, pitch editing).
   */
  previewNote(midi: number, durSec = 0.35): void {
    if (!this.ensureAudio() || !this.melodySink || !this.ctx) return;
    const at = this.ctx.currentTime + 0.01;
    const freq = midiToFreq(midi);
    this.melodySink.tone({
      freq,
      at,
      dur: durSec,
      velocity: 0.85,
      type: "triangle",
      attack: 0.01,
      release: 0.08,
      cutoff: 2400,
      detune: 4,
      octaveGain: 0.2,
    });
  }

  /**
   * Play the full composition (melody + band accompaniment).
   */
  play(
    comp: Composition,
    onProgress: (currentSec: number) => void,
    onEnded: () => void,
  ): boolean {
    if (!this.ensureAudio() || !this.ctx || !this.band || !this.melodySink) return false;
    this.stop();

    const ctx = this.ctx;
    const bpm = comp.tempo > 0 ? comp.tempo : config.rhythm.defaultBpm;
    const meter = comp.timeSignature ?? METER_44;
    const barQ = barQuarters(meter);
    const barSec = (barQ * 60) / bpm;

    // Calculate total duration
    let maxTime = 4.0;
    for (const note of comp.melody) {
      const end = note.startTime + note.duration;
      if (end > maxTime) maxTime = end;
    }
    const totalBars = Math.max(comp.chords.length, Math.ceil(maxTime / barSec));
    this.playDurationSec = Math.max(maxTime, totalBars * barSec);

    const t0 = ctx.currentTime + 0.08;
    this.playStartAudioTime = t0;
    this.isPlaying = true;

    // 1. Schedule Melody
    for (const note of comp.melody) {
      const at = t0 + note.startTime;
      this.melodySink.tone({
        freq: midiToFreq(note.midi),
        at,
        dur: Math.max(0.08, note.duration),
        velocity: note.velocity ?? 0.8,
        type: "sawtooth",
        attack: 0.02,
        release: 0.08,
        cutoff: 2800,
        detune: 3,
        octaveGain: 0.25,
      });
    }

    // 2. Schedule Accompaniment per Bar
    const chordMap = new Map<number, Chord>();
    for (const c of comp.chords) {
      for (let b = 0; b < c.durationBars; b++) {
        chordMap.set(c.startBar + b, c.chord);
      }
    }

    const fallbackChord: Chord = { root: (comp.key?.root ?? 0) as PitchClass, quality: comp.key?.mode === "minor" ? "minor" : "major" };

    for (let bar = 0; bar < totalBars; bar++) {
      const chord = chordMap.get(bar) ?? fallbackChord;
      const barStartAudio = t0 + bar * barSec;
      const input: PassageInput = {
        chords: [chord],
        melody: comp.melody.filter((n) => n.startTime >= bar * barSec && n.startTime < (bar + 1) * barSec),
        phraseStarts: [0],
        meter,
        bpm,
        originSec: 0,
        energy01: 0.6,
        density: 0.5,
        style: styleDrums("neutral"),
      };

      for (const id of INSTRUMENTS) {
        const ch = comp.instruments[id];
        if (ch && ch.muted) continue;
        const engine = this.band[id];
        if (!engine) continue;

        if (ch) {
          engine.setVolume(ch.volume);
          engine.setPan(ch.pan);
        }

        const events = PLAN_OF[id](input, 1);
        engine.schedule(events, {
          audioTime: barStartAudio,
          tempo: { estimated: bpm, target: bpm, playback: bpm, confidence: 1 },
          meter,
        });
      }
    }

    // 3. Track visual progress
    this.progressInterval = setInterval(() => {
      if (!this.isPlaying) return;
      const elapsed = Math.max(0, ctx.currentTime - this.playStartAudioTime);
      onProgress(elapsed);
      if (elapsed >= this.playDurationSec) {
        this.stop();
        onEnded();
      }
    }, 40);

    // Stop timer safety guard
    this.stopTimer = setTimeout(() => {
      if (this.isPlaying) {
        this.stop();
        onEnded();
      }
    }, (this.playDurationSec + 0.6) * 1000);

    return true;
  }

  stop(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.melodySink?.cancel();
    if (this.band) {
      for (const id of INSTRUMENTS) {
        this.band[id]?.stop();
      }
    }
    this.isPlaying = false;
  }

  dispose(): void {
    this.stop();
    try {
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
  }
}
