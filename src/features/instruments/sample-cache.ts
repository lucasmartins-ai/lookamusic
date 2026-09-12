/**
 * SampleCache (Phase 16, TDR-16). Pure note↔sample mapping + a Web-API cache
 * wrapper. No AudioContext at import time — safe for SSR and Node tests.
 *
 * Mapping rule: nearest sampled MIDI wins; the residual `detuneSt` is
 * corrected with `playbackRate` when |detune| ≤ `maxDetuneSt` (config), else
 * the caller falls back to synthesis. Borders (21/108 piano) resolve to the
 * edge sample exactly like interior notes.
 */
import { config } from "@/lib/config";
import type { PitchedPackManifest, PitchedSampleNote } from "./packs/types";

export interface NearestSample {
  note: PitchedSampleNote;
  detuneSt: number;
  rate: number;
}

/** A12 inverse: Hz → fractional MIDI. */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(Math.max(freq, 1) / 440);
}

/** Semitone offset → AudioBufferSourceNode.playbackRate. Exact: 2^(st/12). */
export function semitonesToRate(st: number): number {
  return Math.pow(2, st / 12);
}

function maxDetune(): number {
  return config.instruments.samples.maxDetuneSt;
}

/** Nearest sampled note for a target MIDI (ties → lower sample). */
export function findNearestSample(
  midi: number,
  notes: readonly PitchedSampleNote[],
): { note: PitchedSampleNote; detuneSt: number } | null {
  if (notes.length === 0) return null;
  const target = Math.round(midi);
  let best = notes[0];
  let bestDist = Math.abs(target - Math.round(best.midi));
  for (let i = 1; i < notes.length; i++) {
    const n = notes[i];
    const d = Math.abs(target - Math.round(n.midi));
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return { note: best, detuneSt: target - Math.round(best.midi) };
}

/**
 * Select the sample for a target MIDI, or `null` when the residual exceeds
 * the ±2 st tuning budget (caller must use synthesis — never chipmunk).
 */
export function selectSample(
  midi: number,
  manifest: PitchedPackManifest,
  maxDetuneSt: number = maxDetune(),
): NearestSample | null {
  const found = findNearestSample(midi, manifest.notes);
  if (!found) return null;
  if (Math.abs(found.detuneSt) > maxDetuneSt) return null;
  return { note: found.note, detuneSt: found.detuneSt, rate: semitonesToRate(found.detuneSt) };
}

/** Every MIDI in the manifest range resolves within the tuning budget. */
export function validatePitchedManifest(
  manifest: PitchedPackManifest,
  maxDetuneSt: number = maxDetune(),
): { ok: boolean; gaps: number[] } {
  const gaps: number[] = [];
  for (let midi = manifest.range.minMidi; midi <= manifest.range.maxMidi; midi++) {
    if (!selectSample(midi, manifest, maxDetuneSt)) gaps.push(midi);
  }
  return { ok: gaps.length === 0, gaps };
}

/** Versioned cache key — bumping `cacheVersion` migrates (drops) old packs. */
export function cacheKeyFor(packId: string, version: number = config.instruments.samples.cacheVersion): string {
  return `${config.instruments.samples.cacheName}-v${version}:${packId}`;
}

export type FetchFn = (url: string) => Promise<ArrayBuffer>;
export type DecodeFn = (data: ArrayBuffer) => Promise<AudioBuffer>;

export interface CacheBackend {
  match(url: string): Promise<ArrayBuffer | null>;
  put(url: string, data: ArrayBuffer): Promise<void>;
  clear(): Promise<void>;
}

function defaultFetch(): FetchFn {
  return async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sample fetch ${res.status}: ${url}`);
    return res.arrayBuffer();
  };
}

/**
 * Cache API persistence backend (PWA offline-first). Stores raw encoded
 * bytes under the versioned pack key; decode still happens per visit into
 * memory. Never throws — every failure resolves null/void (memory covers).
 */
export function createCacheApiBackend(
  key: string = cacheKeyFor("shared"),
  storage: { open(name: string): Promise<{ match(req: string): Promise<Response | undefined>; put(req: string, res: Response): Promise<void>; delete(req: string): Promise<boolean> }> } | undefined =
    typeof caches !== "undefined" ? caches : undefined,
): CacheBackend | null {
  if (!storage) return null;
  const open = () => storage.open(key);
  return {
    async match(url: string): Promise<ArrayBuffer | null> {
      try {
        const res = await (await open()).match(url);
        if (!res) return null;
        return await res.arrayBuffer();
      } catch {
        return null;
      }
    },
    async put(url: string, data: ArrayBuffer): Promise<void> {
      try {
        await (await open()).put(url, new Response(data.slice(0)));
      } catch {
        // Quota/privacy mode — memory still covers this visit.
      }
    },
    async clear(): Promise<void> {
      try {
        if (typeof caches !== "undefined") await caches.delete(key);
      } catch {
        // Best-effort migration.
      }
    },
  };
}

/**
 * In-memory + Cache API store for decoded packs. `fetchFn`/`decodeFn` are
 * injected so vitest runs with fakes and zero real network. Browsers pass an
 * `AudioContext.decodeAudioData` bound decoder; the Cache API backend is
 * used when available (PWA offline-first), memory always.
 */
export class SampleCache {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly inflight = new Map<string, Promise<AudioBuffer>>();

  constructor(
    private readonly fetchFn: FetchFn = defaultFetch(),
    private readonly decodeFn: DecodeFn | null = null,
    private readonly backend: CacheBackend | null = null,
  ) {}

  get version(): number {
    return config.instruments.samples.cacheVersion;
  }

  /** Browser wiring: attach an `AudioContext.decodeAudioData` decoder. */
  setDecoder(decode: DecodeFn): void {
    (this as unknown as { decodeFn: DecodeFn | null }).decodeFn = decode;
  }

  /** Browser wiring: attach a Cache API persistence backend. */
  setBackend(backend: CacheBackend | null): void {
    (this as unknown as { backend: CacheBackend | null }).backend = backend;
  }

  has(url: string): boolean {
    return this.buffers.has(url);
  }

  get(url: string): AudioBuffer | null {
    return this.buffers.get(url) ?? null;
  }

  put(url: string, buf: AudioBuffer): void {
    this.buffers.set(url, buf);
  }

  get size(): number {
    return this.buffers.size;
  }

  /** Drop everything from a previous pack generation (cache migration). */
  migrate(fromVersion: number): void {
    if (fromVersion !== this.version) {
      this.buffers.clear();
      this.inflight.clear();
      void this.backend?.clear().catch(() => undefined);
    }
  }

  async ensure(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const flight = this.inflight.get(url);
    if (flight) return flight;
    const job = this.load(url).finally(() => this.inflight.delete(url));
    this.inflight.set(url, job);
    return job;
  }

  private async load(url: string): Promise<AudioBuffer> {
    if (!this.decodeFn) throw new Error(`no decoder for ${url}`);
    let data = await this.backend?.match(url).catch(() => null);
    if (!data) {
      data = await this.fetchFn(url);
      const copy = data.slice(0);
      await this.backend?.put(url, copy).catch(() => undefined);
    }
    const buf = await this.decodeFn(data);
    this.buffers.set(url, buf);
    return buf;
  }

  /**
   * Load a pack with progress (v1.3.3: the packs ship WITH the app, so this
   * runs automatically on first use — no button, no consent). Resolves per
   * URL; a single failure rejects that URL but keeps the rest (the native
   * model covers the gap).
   */
  async loadPack(
    urls: readonly string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ ok: string[]; failed: { url: string; error: string }[] }> {
    const ok: string[] = [];
    const failed: { url: string; error: string }[] = [];
    let done = 0;
    for (const url of urls) {
      try {
        await this.ensure(url);
        ok.push(url);
      } catch (e) {
        failed.push({ url, error: e instanceof Error ? e.message : String(e) });
      }
      done += 1;
      try {
        onProgress?.(done, urls.length);
      } catch {
        // Progress listeners never break a download.
      }
    }
    return { ok, failed };
  }
}
