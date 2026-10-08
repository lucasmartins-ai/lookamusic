/**
 * Sample instruments (Phase 16, TDR-16): nearest-sample mapping, exact
 * playbackRate, fallback on network/decode/missing, manifest coverage,
 * cache migration, synth parity without packs, bit-stable render with mocked
 * packs, weight budgets, scheduler 0-late. Run:
 * npm test -- instruments-samples
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
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
  SilentSink,
  createInstrumentSink,
  drumUrlFor,
  inferDrumVoice,
} from "@/features/instruments/sample-voice";
import { PACK_BY_INSTRUMENT, packUrls } from "@/features/instruments/packs";
import { PIANO_PACK } from "@/features/instruments/packs/piano";
import { VIOLAO_PACK } from "@/features/instruments/packs/violao";
import { DRUMS_PACK } from "@/features/instruments/packs/drums";
import { SAMPLE_INSTRUMENTS, hasRealSound, weightBudgetOf } from "@/features/instruments/sample-store";
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

describe("only real sound (TDR-22): missing sample → silence, never synth", () => {
  const tone = { freq: 440, at: 100.5, dur: 0.4, velocity: 0.8, type: "triangle" as OscillatorType, attack: 0.004, release: 0.3 };

  it("synth fallback is off by default", () => {
    expect(config.instruments.samples.synthFallback).toBe(false);
  });

  it("empty cache → the note is skipped (no sample, no synth)", () => {
    const sources: StubSource[] = [];
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    const { voice, fallback } = sampleVoiceWith(sources, { pitched: PIANO_PACK, cache });
    voice.tone(tone);
    expect(sources.filter((s) => s.started)).toHaveLength(0);
    expect(fallback.calls).toBe(0);
  });

  it("live toggle off → silence; on → samples (instant, no rebuild)", () => {
    const sources: StubSource[] = [];
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    for (const n of PIANO_PACK.notes) cache.put(n.url, fakeBuffer());
    let on = true;
    const { voice, fallback } = sampleVoiceWith(sources, { pitched: PIANO_PACK, cache, enabled: () => on });
    voice.tone(tone);
    expect(sources.filter((s) => s.started)).toHaveLength(1);
    on = false;
    voice.tone(tone);
    expect(sources.filter((s) => s.started)).toHaveLength(1);
    expect(fallback.calls).toBe(0);
  });

  it("fetch / decode failures never throw and never reach the synth", async () => {
    const offline = new SampleCache(async () => {
      throw new Error("offline");
    }, async () => fakeBuffer());
    await expect(offline.ensure("/samples/x.mp3")).rejects.toThrow("offline");
    const bad = new SampleCache(async () => new ArrayBuffer(8), async () => {
      throw new Error("bad mp3");
    });
    await expect(bad.ensure("/samples/y.mp3")).rejects.toThrow("bad mp3");
    for (const cache of [offline, bad]) {
      const { voice, fallback } = sampleVoiceWith([], { pitched: PIANO_PACK, cache });
      expect(() => voice.tone(tone)).not.toThrow();
      expect(fallback.calls).toBe(0);
    }
  });

  it("synthFallback=true restores the procedural sink (debug switch)", () => {
    const samples = config.instruments.samples as { synthFallback: boolean };
    const prev = samples.synthFallback;
    samples.synthFallback = true;
    try {
      const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
      const { voice, fallback } = sampleVoiceWith([], { pitched: PIANO_PACK, cache });
      voice.tone(tone);
      expect(fallback.tones).toHaveLength(1);
    } finally {
      samples.synthFallback = prev;
    }
  });

  it("drums with full pack → one recorded hit per noise event, zero synth", () => {
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    for (const u of DRUMS_PACK.voices.flatMap((v) => v.layers.flat())) cache.put(u, fakeBuffer(0.5));
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

  it("drum layers follow velocity and repeats alternate round-robin takes", () => {
    expect(drumUrlFor(DRUMS_PACK, "snare", 0.1, 0)).toContain("snare_l1_r1");
    expect(drumUrlFor(DRUMS_PACK, "snare", 0.1, 1)).toContain("snare_l1_r2");
    expect(drumUrlFor(DRUMS_PACK, "snare", 1, 0)).toContain("snare_l3_r1");
    expect(drumUrlFor(DRUMS_PACK, "kazoo", 0.5, 0)).toBeNull();
  });

  it("pitched layers: soft note → soft recording, loud note → loud recording", () => {
    expect(selectSample(60, PIANO_PACK, 2, 0.3)!.note.url).toContain("_v6");
    expect(selectSample(60, PIANO_PACK, 2, 0.95)!.note.url).toContain("_v12");
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

  it("without packs: total silence (no synth parity anymore, TDR-22)", () => {
    for (const [id, plan] of [["piano", planPiano], ["violao", planViolao]] as const) {
      const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
      const sources: StubSource[] = [];
      const { voice, fallback } = sampleVoiceWith(sources, { pitched: id === "piano" ? PIANO_PACK : VIOLAO_PACK, cache });
      const events = plan(twoBars(), 2).filter((e) => e.instrument === id);
      expect(events.length).toBeGreaterThan(0);
      new EngineBase(id, voice, pitchedTimbreOf(id)).schedule(events, scheduleCtx());
      expect(sources.filter((s) => s.started)).toHaveLength(0);
      expect(fallback.calls).toBe(0);
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

describe("weights: bundled pack size stays inside the budget", () => {
  const ALL = Object.values(PACK_BY_INSTRUMENT);

  it("every pack fits its instrument budget", () => {
    for (const id of SAMPLE_INSTRUMENTS) {
      expect(PACK_BY_INSTRUMENT[id].totalBytesEstimate, id).toBeLessThanOrEqual(weightBudgetOf(id));
    }
  });

  it("packs vêm EMPACOTADOS no app (mesma origem, nunca remoto)", () => {
    const urls = ALL.flatMap(packUrls);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u.startsWith("/samples/")).toBe(true);
      expect(u).not.toMatch(/^https?:/);
    }
  });

  it("todo URL de pack existe de fato em public/ (manifest ↔ bundle)", () => {
    const urls = ALL.flatMap(packUrls);
    // 60 piano + 48 violão + 66 bateria + 22 baixo + 30 violino + 22 cordas.
    expect(urls.length).toBe(248);
    for (const u of urls) {
      expect(u).not.toContain("#");
      expect(u).not.toContain(" ");
      expect(existsSync(join(process.cwd(), "public", u)), u).toBe(true);
    }
  });

  it("every pitched pack covers its range within the ±2 st retune budget", () => {
    for (const p of ALL) if (p.kind === "pitched") expect(validatePitchedManifest(p).gaps, p.packId).toEqual([]);
  });

  it("instruments without a real recording are silent, never synthesized", () => {
    expect(hasRealSound("guitar")).toBe(false);
    expect(hasRealSound("sax")).toBe(false);
    expect(hasRealSound("accordion")).toBe(false);
    for (const id of SAMPLE_INSTRUMENTS) expect(hasRealSound(id)).toBe(true);
    const ctx = stubCtx([]);
    const master = stubGain();
    const cache = new SampleCache(async () => new ArrayBuffer(8), async () => fakeBuffer());
    for (const id of ["guitar", "sax", "accordion"]) {
      const sink = createInstrumentSink(ctx as unknown as BaseAudioContext, master as unknown as AudioNode, id, cache);
      expect(sink).toBeInstanceOf(SilentSink);
    }
    const bass = createInstrumentSink(ctx as unknown as BaseAudioContext, master as unknown as AudioNode, "bass", cache);
    expect(bass).toBeInstanceOf(SampleVoice);
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
