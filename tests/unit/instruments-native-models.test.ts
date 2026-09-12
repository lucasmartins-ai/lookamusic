/**
 * Hotfix modelos nativos: piano/violão/bateria soam como instrumentos reais
 * SEM download (banco de parciais aditivos no engine). Sem modelo nativo, o
 * caminho antigo de oscilador único fica intacto.
 * Run: npm test -- instruments-native-models
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { WebAudioSink } from "@/features/instruments/audio-sink";
import { createBand } from "@/features/instruments/registry";
import { drumBodyOf, nativeModelOf, pitchedTimbreOf } from "@/features/instruments/engine-base";
import { createPianoEngine } from "@/features/instruments/piano";
import { createViolaoEngine } from "@/features/instruments/violao";
import { FakeSink } from "../helpers/fake-sink";

interface Node {
  connect: (t: unknown) => void;
  disconnect: () => void;
}

function param(ramps: number[] = []) {
  return {
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: (v: number) => {
      ramps.push(v);
    },
    setTargetAtTime: () => {},
  };
}

function stubCtx() {
  const oscillators: unknown[] = [];
  const buffers: unknown[] = [];
  const ramps: number[] = [];
  const ctx = {
    sampleRate: 44100,
    currentTime: 0,
    createGain: () => ({ gain: param(), connect: () => {}, disconnect: () => {} }) as unknown as Node,
    createBiquadFilter: () => ({ type: "lowpass", frequency: param(), connect: () => {}, disconnect: () => {} }) as unknown,
    createOscillator: () => {
      const n = { type: "sine", frequency: param(ramps), detune: param(), connect: () => {}, start: () => {}, stop: () => {} };
      oscillators.push(n);
      return n;
    },
    createBufferSource: () => {
      const n = { buffer: null, loop: false, playbackRate: param(), connect: () => {}, start: () => {}, stop: () => {} };
      buffers.push(n);
      return n;
    },
    createBuffer: (_ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx, oscillators, buffers, ramps };
}

const MASTER = { connect: () => {} } as unknown as AudioNode;

function ev(midi: number): MusicalEvent {
  return {
    note: { id: "n1", pitch: 440, midi, startTime: 0, duration: 0.4, velocity: 0.8, confidence: 1, source: "generated" },
    instrument: "piano",
    bar: 0,
    beat: 0,
  };
}

const ctxOf = (): ScheduleContext => ({
  audioTime: 0,
  tempo: { estimated: 90, target: 90, playback: 90, confidence: 1 },
  meter: { numerator: 4, denominator: 4 },
});

describe("modelos nativos (sem download)", () => {
  it("piano e violão carregam banco de parciais + ataque de ruído", () => {
    const piano = pitchedTimbreOf("piano");
    const violao = pitchedTimbreOf("violao");
    expect(piano.partials?.length).toBeGreaterThanOrEqual(4);
    expect(violao.partials?.length).toBeGreaterThanOrEqual(4);
    expect(piano.partials?.[0]?.ratio).toBe(1);
    expect(piano.noiseAttack?.gain).toBeGreaterThan(0);
    expect(violao.noiseAttack?.gain).toBeGreaterThan(0);
  });

  it("instrumentos sem modelo nativo mantêm o oscilador único (sem regressão)", () => {
    expect(nativeModelOf("bass")).toEqual({});
    expect(pitchedTimbreOf("bass").partials).toBeUndefined();
    expect(drumBodyOf("hihat")).toBeUndefined();
    expect(drumBodyOf("kick")?.length).toBeGreaterThan(1);
  });

  it("a bateria ganha corpo membranoso nas vozes com pele", () => {
    expect(drumBodyOf("kick")?.length).toBeGreaterThan(1);
    expect(drumBodyOf("tom")?.length).toBeGreaterThan(1);
    expect(drumBodyOf("crash")).toBeUndefined();
  });

  it("o engine repassa o modelo ao sink (piano/violão)", () => {
    const sink = new FakeSink();
    const piano: InstrumentEngine = createPianoEngine(sink);
    piano.schedule([ev(60)], ctxOf());
    expect(sink.tones).toHaveLength(1);
    expect(sink.tones[0].partials?.length).toBeGreaterThanOrEqual(4);
    expect(sink.tones[0].noiseAttack?.gain).toBeGreaterThan(0);

    const sink2 = new FakeSink();
    createViolaoEngine(sink2).schedule([{ ...ev(64), instrument: "violao" }], ctxOf());
    expect(sink2.tones[0].partials?.length).toBeGreaterThanOrEqual(4);
  });

  it("WebAudioSink renderiza um oscilador por parcial + transiente", () => {
    const { ctx, oscillators, buffers } = stubCtx();
    const sink = new WebAudioSink(ctx as unknown as BaseAudioContext, MASTER);
    sink.tone({
      freq: 261.6,
      at: 0,
      dur: 0.4,
      velocity: 0.8,
      type: "triangle",
      attack: 0.004,
      release: 0.1,
      cutoff: 2800,
      partials: config.instruments.nativeModels.piano.partials,
      noiseAttack: config.instruments.nativeModels.piano.noiseAttack,
      brightnessPerOctave: config.instruments.nativeModels.piano.brightnessPerOctave,
    });
    expect(oscillators).toHaveLength(config.instruments.nativeModels.piano.partials.length);
    expect(buffers).toHaveLength(1); // martelo

    // Corpo membranoso mantém o sweep de afinação (bumbo/tom).
    const drum = stubCtx();
    const drumSink = new WebAudioSink(drum.ctx as unknown as BaseAudioContext, MASTER);
    drumSink.tone({
      freq: 120,
      freqEnd: 45,
      at: 0,
      dur: 0.14,
      velocity: 0.9,
      type: "sine",
      attack: 0.002,
      release: 0.08,
      cutoff: 1600,
      partials: drumBodyOf("kick"),
    });
    expect(drum.ramps).toContain(45);

    const legacy = stubCtx();
    const sink2 = new WebAudioSink(legacy.ctx as unknown as BaseAudioContext, MASTER);
    sink2.tone({ freq: 220, at: 0, dur: 0.3, velocity: 0.7, type: "sawtooth", attack: 0.01, release: 0.2, cutoff: 1500 });
    expect(legacy.oscillators).toHaveLength(1);
    expect(legacy.buffers).toHaveLength(0);
  });

  it("a banda inteira constrói sem modelo nativo (registro intacto)", () => {
    const band = createBand(() => new FakeSink());
    expect(Object.keys(band).sort()).toEqual([...["drums", "bass", "piano", "guitar", "violao", "strings", "violin", "sax", "accordion"]].sort());
  });
});
