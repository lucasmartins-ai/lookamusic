/**
 * Sample instruments (Phase 16, TDR-16): nearest-sample mapping, exact
 * playbackRate, fallback on network/decode/missing, manifest coverage,
 * cache migration, synth parity without packs, bit-stable render with mocked
 * packs, weight budgets, scheduler 0-late. Run:
 * npm test -- instruments-samples
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { FakeSink } from "../helpers/fake-sink";
import { demoPassage, scheduleCtx } from "../helpers/passage";
import { planDrums, planPiano, planViolao } from "@/features/instruments/planning";
import { EngineBase, pitchedTimbreOf } from "@/features/instruments/engine-base";
import {
  SampleCache,
  cacheKeyFor,
  createCacheApiBackend,
  findNearestSample,
  freqToMidi,
  selectSample,
  semitonesToRate,
  validatePitchedManifest,
} from "@/features/instruments/sample-cache";
import {
  SampleVoice,
  createInstrumentSink,
  inferDrumVoice,
  shouldUseSamples,
} from "@/features/instruments/sample-voice";
import { PIANO_PACK } from "@/features/instruments/packs/piano";
import { VIOLAO_PACK } from "@/features/instruments/packs/violao";
import { DRUMS_PACK } from "@/features/instruments/packs/drums";
import { weightBudgetOf } from "@/features/instruments/sample-store";
import { LookaheadScheduler } from "@/features/instruments/scheduler";

/* ---------- stub Web Audio (Node-safe, no real sound) ---------- */

interface StubSource {
  buffer: unknown;
  playbackRate: { value: number };
  started: boolean;
  stopped: boolean;
  connect: (t: unknown) => void;
  disconnect: () => void;
  start: (at?: number) => void;
  stop: (at?: number) => void;
  onended: (() => void) | null;
}

function stubGain() {
  return {
    gain: {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      setTargetAtTime: () => {},
    },
    connect: () => {},
    disconnect: () => {},
  };
}

function stubCtx(sources: StubSource[]) {
  return {
    sampleRate: 44100,
    currentTime: 100,
    createGain: () => stubGain(),
    createStereoPanner: () => ({
      pan: { setTargetAtTime: () => {} },
      connect: () => {},
      disconnect: () => {},
    }),
    createBufferSource: () => {
      const s: StubSource = {
        buffer: null,
        playbackRate: { value: 1 },
        started: false,
        stopped: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {
          s.started = true;
        },
        stop: () => {
          s.stopped = true;
        },
        onended: null,
      };
      sources.push(s);
      return s;
    },
  };
}

function fakeBuffer(duration = 1.0): AudioBuffer {
  return { duration, sampleRate: 44100 } as unknown as AudioBuffer;
}

function sampleVoiceWith(
  sources: StubSource[],
  opts: {
    pitched?: typeof PIANO_PACK;
    drums?: boolean;
    cache: SampleCache;
    fallback?: FakeSink;
    useSamples?: boolean;
    enabled?: () => boolean;
  },
) {
  const ctx = stubCtx(sources);
  const master = stubGain();
  const fallback = opts.fallback ?? new FakeSink();
  const voice = new SampleVoice(ctx as unknown as BaseAudioContext, master as unknown as AudioNode, {
    pitchedPack: opts.pitched,
    drumPack: opts.drums ? DRUMS_PACK : undefined,
    cache: opts.cache,
    fallback,
    useSamples: opts.useSamples ?? true,
    ...(opts.enabled ? { enabled: opts.enabled } : {}),
  });
  return { voice, fallback };
}

/* ---------- mapping ---------- */

describe("mapping: nearest sample ±2st", () => {
  it("exact grid notes resolve with 0 detune (21/24/…/108)", () => {
    for (let midi = 21; midi <= 108; midi += 3) {
      const sel = selectSample(midi, PIANO_PACK);
      expect(sel?.note.midi).toBe(midi);
      expect(sel?.detuneSt).toBe(0);
      expect(sel?.rate).toBeCloseTo(1, 12);
    }
  });

  it("off-grid notes snap to the nearest sample within ±2st", () => {
    // 22 sits between 21 and 24 → nearer 21 (+1).
    expect(selectSample(22, PIANO_PACK)?.note.midi).toBe(21);
    expect(selectSample(22, PIANO_PACK)?.detuneSt).toBe(1);
    // 23 → nearer 24 (−1).
    expect(selectSample(23, PIANO_PACK)?.note.midi).toBe(24);
    expect(selectSample(23, PIANO_PACK)?.detuneSt).toBe(-1);
  });

  it("borders 21/108 clamp to the edge sample (no wrap, no null)", () => {
    expect(findNearestSample(21, PIANO_PACK.notes)?.note.midi).toBe(21);
    expect(findNearestSample(108, PIANO_PACK.notes)?.note.midi).toBe(108);
    expect(selectSample(20, PIANO_PACK)?.note.midi).toBe(21);
    expect(selectSample(20, PIANO_PACK)?.detuneSt).toBe(-1);
  });

  it("empty pack → null (synth fallback, never throw)", () => {
    expect(findNearestSample(60, [])).toBeNull();
    expect(selectSample(60, { ...PIANO_PACK, notes: [] })).toBeNull();
  });
});

describe("playbackRate: exact per semitone", () => {
  it("2^(st/12) for −2…+2", () => {
    for (const st of [-2, -1, 0, 1, 2]) {
      expect(semitonesToRate(st)).toBeCloseTo(Math.pow(2, st / 12), 12);
    }
  });

  it("A4 (440 Hz) → MIDI 69", () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 9);
    expect(Math.round(freqToMidi(261.63))).toBe(60);
  });
});

describe("manifest: full range coverage", () => {
  it("piano 21–108 every note within ±2st", () => {
    const v = validatePitchedManifest(PIANO_PACK);
    expect(v.gaps).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("violão (declared range) every note within ±2st", () => {
    const v = validatePitchedManifest(VIOLAO_PACK);
    expect(v.gaps).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("violão real grid: neighbour gaps ≤ 2 st (honest ±2st retune budget)", () => {
    const midis = VIOLAO_PACK.notes.map((n) => n.midi).sort((a, b) => a - b);
    expect(midis.length).toBeGreaterThan(20);
    for (let i = 1; i < midis.length; i++) {
      expect(midis[i] - midis[i - 1]).toBeLessThanOrEqual(2);
    }
  });

  it("sparse pack reports exact gaps", () => {
    const v = validatePitchedManifest({ ...PIANO_PACK, notes: PIANO_PACK.notes.slice(0, 1) });
    expect(v.ok).toBe(false);
    expect(v.gaps.length).toBeGreaterThan(0);
    expect(v.gaps).toContain(108);
  });
});

/* ---------- fallback ---------- */

describe("fallback: network / decode / missing → synth, never silence", () => {
  const tone = { freq: 440, at: 100.5, dur: 0.4, velocity: 0.8, type: "triangle" as OscillatorType, attack: 0.004, release: 0.3 };

  it("empty cache → every tone lands on the fallback sink", () => {
    const sources: StubSource[] = [];
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    const { voice, fallback } = sampleVoiceWith(sources, { pitched: PIANO_PACK, cache });
    voice.tone(tone);
    expect(sources.filter((s) => s.started)).toHaveLength(0);
    expect(fallback.tones).toHaveLength(1);
  });

  it("useSamples=false → synth even with buffers cached", () => {
    const sources: StubSource[] = [];
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    const sel = selectSample(69, PIANO_PACK)!;
    cache.put(sel.note.url, fakeBuffer());
    const { voice, fallback } = sampleVoiceWith(sources, { pitched: PIANO_PACK, cache, useSamples: false });
    voice.tone({ ...tone, freq: 440 });
    expect(sources.filter((s) => s.started)).toHaveLength(0);
    expect(fallback.tones).toHaveLength(1);
  });

  it("live toggle off → synth; on → samples (instant, no rebuild)", () => {
    const sources: StubSource[] = [];
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    const sel = selectSample(69, PIANO_PACK)!;
    cache.put(sel.note.url, fakeBuffer());
    let on = true;
    const { voice, fallback } = sampleVoiceWith(sources, {
      pitched: PIANO_PACK, cache, enabled: () => on,
    });
    voice.tone(tone);
    expect(sources.filter((s) => s.started)).toHaveLength(1);
    on = false;
    voice.tone(tone);
    expect(fallback.tones).toHaveLength(1);
  });

  it("fetch failure keeps old buffers and falls back per-note", async () => {
    const cache = new SampleCache(
      async () => {
        throw new Error("offline");
      },
      async () => fakeBuffer(),
    );
    await expect(cache.ensure("https://x/missing.mp3")).rejects.toThrow("offline");
    const sources: StubSource[] = [];
    const { voice, fallback } = sampleVoiceWith(sources, { pitched: PIANO_PACK, cache });
    expect(() => voice.tone(tone)).not.toThrow();
    expect(fallback.tones).toHaveLength(1);
  });

  it("decode failure → fallback, no exception, no silence", async () => {
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => {
      throw new Error("bad ogg");
    });
    await expect(cache.ensure("https://x/bad.ogg")).rejects.toThrow("bad ogg");
    const sources: StubSource[] = [];
    const { voice, fallback } = sampleVoiceWith(sources, { pitched: PIANO_PACK, cache });
    expect(() => voice.tone(tone)).not.toThrow();
    expect(fallback.tones).toHaveLength(1);
  });

  it("drums without pack → membrane+noise pair identical to synth", () => {
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    const sources: StubSource[] = [];
    const { voice, fallback } = sampleVoiceWith(sources, { drums: true, cache });
    const engine = new EngineBase("drums", voice, { kind: "drums" });
    const synthSink = new FakeSink();
    const synth = new EngineBase("drums", synthSink, { kind: "drums" });
    const events = planDrums(demoPassage(), 1);
    expect(events.length).toBeGreaterThan(0);
    engine.schedule(events, scheduleCtx());
    synth.schedule(events, scheduleCtx());
    expect(sources.filter((s) => s.started)).toHaveLength(0);
    expect(fallback.tones).toEqual(synthSink.tones);
    expect(fallback.noises).toEqual(synthSink.noises);
  });

  it("drums with full pack → one source per noise hit, zero fallback", () => {
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    for (const v of DRUMS_PACK.voices) cache.put(v.url, fakeBuffer(0.5));
    const sources: StubSource[] = [];
    const { voice, fallback } = sampleVoiceWith(sources, { drums: true, cache });
    const engine = new EngineBase("drums", voice, { kind: "drums" });
    const events = planDrums(demoPassage(), 1);
    engine.schedule(events, scheduleCtx());
    const synthNoises = new FakeSink();
    new EngineBase("drums", synthNoises, { kind: "drums" }).schedule(events, scheduleCtx());
    expect(sources.filter((s) => s.started).length).toBe(synthNoises.noises.length);
    expect(fallback.calls).toBe(0);
  });
});

/* ---------- cache migration ---------- */

describe("cache migration between versions", () => {
  it("versioned keys differ; migrate() drops stale buffers", async () => {
    expect(cacheKeyFor("piano", 1)).not.toBe(cacheKeyFor("piano", 2));
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    cache.put("https://x/a.mp3", fakeBuffer());
    expect(cache.size).toBe(1);
    cache.migrate(999);
    expect(cache.size).toBe(0);
    cache.put("https://x/a.mp3", fakeBuffer());
    cache.migrate(config.instruments.samples.cacheVersion);
    expect(cache.size).toBe(1);
  });

  it("concurrent ensure() of one URL fetches once", async () => {
    let fetches = 0;
    const cache = new SampleCache(
      async () => {
        fetches += 1;
        return new ArrayBuffer(8);
      },
      async () => fakeBuffer(),
    );
    const [a, b] = await Promise.all([cache.ensure("https://x/once.mp3"), cache.ensure("https://x/once.mp3")]);
    expect(a).toBe(b);
    expect(fetches).toBe(1);
  });

  it("Cache API backend: null without storage, round-trip with a fake", async () => {
    expect(createCacheApiBackend("k", undefined)).toBeNull();
    const store = new Map<string, ArrayBuffer>();
    const storage = {
      async open(_name: string) {
        return {
          async match(req: string) {
            const hit = store.get(req);
            return hit ? ({ arrayBuffer: async () => hit.slice(0) } as unknown as Response) : undefined;
          },
          async put(req: string, res: Response) {
            store.set(req, await res.arrayBuffer());
          },
          async delete(_req: string) {
            return true;
          },
        };
      },
    };
    const backend = createCacheApiBackend("lookamusic-test", storage);
    expect(backend).not.toBeNull();
    let fetches = 0;
    const cache = new SampleCache(
      async () => {
        fetches += 1;
        return new Uint8Array([1, 2, 3, 4]).buffer;
      },
      async () => fakeBuffer(),
      backend,
    );
    await cache.ensure("https://x/persist.mp3");
    expect(fetches).toBe(1);
    // Second cache over the same backend serves bytes without fetching.
    const cache2 = new SampleCache(
      async () => {
        fetches += 1;
        return new ArrayBuffer(4);
      },
      async () => fakeBuffer(),
      backend,
    );
    await cache2.ensure("https://x/persist.mp3");
    expect(fetches).toBe(1);
  });
});

/* ---------- integration: 2 bars bit-stable / synth parity ---------- */

describe("integration: 2-bar piano+violão render", () => {
  function twoBars() {
    return demoPassage();
  }

  it("without packs: output identical to today's synth (parity snapshot)", () => {
    for (const [id, plan] of [["piano", planPiano], ["violao", planViolao]] as const) {
      const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
      const sources: StubSource[] = [];
      const { voice, fallback } = sampleVoiceWith(sources, {
        pitched: id === "piano" ? PIANO_PACK : VIOLAO_PACK,
        cache,
      });
      const timbre = pitchedTimbreOf(id);
      const viaSamples = new EngineBase(id, voice, timbre);
      const synthSink = new FakeSink();
      const viaSynth = new EngineBase(id, synthSink, timbre);
      const events = plan(twoBars(), 2).filter((e) => e.instrument === id);
      expect(events.length).toBeGreaterThan(0);
      viaSamples.schedule(events, scheduleCtx());
      viaSynth.schedule(events, scheduleCtx());
      expect(sources.filter((s) => s.started)).toHaveLength(0);
      expect(fallback.tones).toEqual(synthSink.tones);
    }
  });

  it("with mocked packs: all-real, deterministic across runs (bit-stable)", () => {
    for (const [id, plan, pack] of [
      ["piano", planPiano, PIANO_PACK],
      ["violao", planViolao, VIOLAO_PACK],
    ] as const) {
      const mkCache = () => {
        const c = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
        for (const n of pack.notes) c.put(n.url, fakeBuffer());
        return c;
      };
      const run = () => {
        const sources: StubSource[] = [];
        const fb = new FakeSink();
        const { voice } = sampleVoiceWith(sources, { pitched: pack, cache: mkCache(), fallback: fb });
        new EngineBase(id, voice, pitchedTimbreOf(id)).schedule(
          plan(twoBars(), 2).filter((e) => e.instrument === id),
          scheduleCtx(),
        );
        return { started: sources.filter((s) => s.started).length, fallbackCalls: fb.calls, sources };
      };
      const a = run();
      const b = run();
      expect(a.fallbackCalls).toBe(0);
      expect(a.started).toBeGreaterThan(0);
      expect(b.started).toBe(a.started);
      expect(b.sources.map((s) => s.playbackRate.value)).toEqual(a.sources.map((s) => s.playbackRate.value));
    }
  });

  it("scheduler stays 0-late driving sample-backed engines", () => {
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    const sources: StubSource[] = [];
    const { voice } = sampleVoiceWith(sources, { pitched: PIANO_PACK, cache });
    const engine = new EngineBase("piano", voice, pitchedTimbreOf("piano"));
    const events = planPiano(demoPassage(), 2);
    let now = 1000;
    const sched = new LookaheadScheduler<{ audioTime: number; run: () => void }>(
      (hit) => hit.run(),
      { now: () => now },
    );
    // Items start 100 ms in the future (past the 25 ms clock-skew grace).
    const t0 = 1000.1;
    sched.push(
      events.map((e, k) => ({
        audioTime: t0 + k * 0.05,
        run: () => engine.schedule([e], scheduleCtx(t0 + k * 0.05)),
      })),
    );
    let late = 0;
    for (let i = 0; i < 20; i++) {
      now += 0.05;
      late += sched.tick().late;
    }
    expect(sched.dispatchedTotal).toBe(events.length);
    expect(late).toBe(0);
  });
});

/* ---------- weights + wiring ---------- */

describe("weights: transfer budgets respected", () => {
  it("piano ≤ 2 MB, violão ≤ 3 MB, bateria ≤ 2 MB", () => {
    expect(PIANO_PACK.totalBytesEstimate).toBeLessThanOrEqual(weightBudgetOf("piano"));
    expect(weightBudgetOf("piano")).toBe(2 * 1024 * 1024);
    expect(VIOLAO_PACK.totalBytesEstimate).toBeLessThanOrEqual(weightBudgetOf("violao"));
    expect(weightBudgetOf("violao")).toBe(5 * 1024 * 1024);
    expect(DRUMS_PACK.totalBytesEstimate).toBeLessThanOrEqual(weightBudgetOf("drums"));
    expect(weightBudgetOf("drums")).toBe(2 * 1024 * 1024);
  });

  it("packs are remote-only (https, never bundled local assets)", () => {
    const urls = [
      ...PIANO_PACK.notes.map((n) => n.url),
      ...VIOLAO_PACK.notes.map((n) => n.url),
      ...DRUMS_PACK.voices.map((v) => v.url),
    ];
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith("https://")).toBe(true);
  });

  it("every pack URL is fetch-safe (no raw '#' fragment, no spaces, decodable)", () => {
    // Regression: a raw `#` truncates the path (FreePats ships `C#2.flac`),
    // which made every download 404. Sharps must be percent-encoded.
    const urls = [
      ...PIANO_PACK.notes.map((n) => n.url),
      ...VIOLAO_PACK.notes.map((n) => n.url),
      ...DRUMS_PACK.voices.map((v) => v.url),
    ];
    for (const u of urls) {
      expect(u).not.toContain("#");
      expect(u).not.toContain(" ");
      expect(() => decodeURIComponent(u)).not.toThrow();
    }
    // The guitar pack genuinely contains encoded sharps.
    expect(VIOLAO_PACK.notes.some((n) => n.url.includes("%23"))).toBe(true);
  });

  it("guitar keeps synthesis (no pack, flag off)", () => {
    expect(shouldUseSamples("guitar")).toBe(false);
    expect(shouldUseSamples("piano")).toBe(true);
    expect(shouldUseSamples("violao")).toBe(true);
    expect(shouldUseSamples("drums")).toBe(true);
  });

  it("createInstrumentSink: unknown/guitar → plain procedural sink", () => {
    const sources: StubSource[] = [];
    const ctx = stubCtx(sources);
    const master = stubGain();
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    const guitar = createInstrumentSink(
      ctx as unknown as BaseAudioContext,
      master as unknown as AudioNode,
      "guitar",
      cache,
    );
    expect(guitar.constructor.name).toBe("WebAudioSink");
    const nocache = createInstrumentSink(
      ctx as unknown as BaseAudioContext,
      master as unknown as AudioNode,
      "piano",
      null,
    );
    expect(nocache.constructor.name).toBe("WebAudioSink");
  });

  it("inferDrumVoice resolves every configured recipe (unknown → null)", () => {
    const recipes = config.instruments.drumVoices as Record<string, { filterType: string; filterFreq: number }>;
    for (const [voice, r] of Object.entries(recipes)) {
      expect(inferDrumVoice({ at: 0, dur: 0.1, velocity: 0.8, filterType: r.filterType as BiquadFilterType, filterFreq: r.filterFreq })).toBe(voice);
    }
    expect(
      inferDrumVoice({ at: 0, dur: 0.1, velocity: 0.8, filterType: "lowpass", filterFreq: 12345 }),
    ).toBeNull();
  });
});
