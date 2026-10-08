/**
 * Sample store (Phase 16 / v1.3.3). Business logic for real-vs-native packs —
 * NEVER in `components/` (they only render). Owns the shared `SampleCache`, the
 * persisted real/synth preference, pack metadata, and the automatic loader
 * that decodes the bundled packs on the same origin (no download, no gesture).
 * No AudioContext at import time.
 */
import { config } from "@/lib/config";
import { SampleCache, createCacheApiBackend, type DecodeFn } from "./sample-cache";
import { PACK_BY_INSTRUMENT, packUrls } from "./packs";

/** Instruments with a bundled real-sound pack (the ONLY ones that sound, TDR-22). */
export type SampleInstrumentId = "piano" | "violao" | "drums" | "bass" | "violin" | "strings";

export const SAMPLE_INSTRUMENTS: readonly SampleInstrumentId[] = ["piano", "violao", "drums", "bass", "violin", "strings"] as const;

/** True when the instrument has real recordings (UI: others are unavailable). */
export function hasRealSound(id: string): boolean {
  return (SAMPLE_INSTRUMENTS as readonly string[]).includes(id);
}

export interface SamplePackMeta {
  instrument: SampleInstrumentId;
  packId: string;
  license: string;
  attribution: string;
  moreInfoUrl: string;
  bytesEstimate: number;
  urls: readonly string[];
}

export function packMetaOf(id: SampleInstrumentId): SamplePackMeta {
  const pack = PACK_BY_INSTRUMENT[id];
  return {
    instrument: id,
    packId: pack.packId,
    license: pack.license,
    attribution: pack.attribution,
    moreInfoUrl: pack.moreInfoUrl,
    bytesEstimate: pack.totalBytesEstimate,
    urls: packUrls(pack),
  };
}

/** Transfer budget per instrument (bytes, from config — no magic numbers). */
export function weightBudgetOf(id: SampleInstrumentId): number {
  return config.instruments.samples[id].weightBudgetBytes;
}

let shared: SampleCache | null = null;

/** Shared runtime cache (one per page; tests construct their own). */
export function getSampleCache(): SampleCache {
  if (!shared) {
    shared = new SampleCache();
    // Browser only: persist encoded bytes in the Cache API (PWA
    // offline-first). Server/Node have no `caches` → memory only.
    try {
      const backend = createCacheApiBackend();
      if (backend) shared.setBackend(backend);
    } catch {
      // Memory covers this visit.
    }
  }
  return shared;
}

/** For tests: swap/reset the singleton. */
export function resetSampleCache(cache: SampleCache | null = null): void {
  shared = cache;
}

function decoderFromOfflineContext(): DecodeFn | null {
  try {
    const OC = (globalThis as unknown as {
      OfflineAudioContext?: typeof OfflineAudioContext;
    }).OfflineAudioContext;
    if (!OC) return null;
    const oc = new OC(1, 44100, 44100);
    return (data: ArrayBuffer) => oc.decodeAudioData(data.slice(0));
  } catch {
    return null;
  }
}

/** Ensure the shared cache can decode (browser only; no-op in Node/tests). */
export function ensureSampleDecoder(): boolean {
  const cache = getSampleCache();
  const current = (cache as unknown as { decodeFn?: DecodeFn | null }).decodeFn;
  if (current) return true;
  const decode = decoderFromOfflineContext();
  if (!decode) return false;
  try {
    cache.setDecoder(decode);
  } catch {
    return false;
  }
  return true;
}

export type UseRealPrefs = Record<SampleInstrumentId, boolean>;

export function defaultUseRealPrefs(): UseRealPrefs {
  return Object.fromEntries(SAMPLE_INSTRUMENTS.map((id) => [id, true])) as UseRealPrefs;
}

export function loadUseRealPrefs(): UseRealPrefs {
  const fallback = defaultUseRealPrefs();
  try {
    const raw = globalThis.localStorage?.getItem(config.instruments.samples.toggleStorageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UseRealPrefs>;
    for (const id of SAMPLE_INSTRUMENTS) if (typeof parsed[id] === "boolean") fallback[id] = parsed[id] as boolean;
    return fallback;
  } catch {
    return fallback;
  }
}

export function saveUseRealPrefs(prefs: UseRealPrefs): void {
  try {
    globalThis.localStorage?.setItem(config.instruments.samples.toggleStorageKey, JSON.stringify(prefs));
  } catch {
    // Persistence is best-effort; the toggle still works in-memory.
  }
}

/**
 * v1.3.3: the packs ship inside the app, so there is nothing to consent to and
 * nothing to click — the loader below just decodes them from the same origin.
 * Returns true when the runtime can load them at all (browser + decoder).
 */
export function canAutoLoadPacks(): boolean {
  return typeof window !== "undefined" && ensureSampleDecoder();
}

/**
 * Live in-memory flags read per-note by `SampleVoice` (cheap, no
 * localStorage IO on the audio path). The hook keeps these + persisted
 * prefs in sync; sinks are built once and react instantly to toggles.
 */
const liveFlags: Record<SampleInstrumentId, boolean> = defaultUseRealPrefs();

let flagsSynced = false;

export function syncSampleFlags(prefs: UseRealPrefs): void {
  for (const id of SAMPLE_INSTRUMENTS) liveFlags[id] = prefs[id] !== false;
  flagsSynced = true;
}

export function setSampleEnabled(id: SampleInstrumentId, v: boolean): void {
  liveFlags[id] = v;
}

export function isSampleEnabled(id: SampleInstrumentId): boolean {
  if (!flagsSynced) {
    try {
      syncSampleFlags(loadUseRealPrefs());
    } catch {
      // Defaults stand.
    }
  }
  return liveFlags[id] !== false;
}

/** True when every pack URL is decoded and ready (no network needed). */
export function isPackReady(id: SampleInstrumentId, cache: SampleCache = getSampleCache()): boolean {
  const meta = packMetaOf(id);
  return meta.urls.every((u) => cache.has(u));
}
