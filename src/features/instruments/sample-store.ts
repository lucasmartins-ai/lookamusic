/**
 * Sample store (Phase 16). Business logic for real-vs-synth packs — NEVER in
 * `components/` (they only render). Owns the shared `SampleCache`, the
 * persisted real/synth preference, pack metadata, and the consent-gated
 * download runner. No AudioContext at import time.
 */
import { config } from "@/lib/config";
import { SampleCache, createCacheApiBackend, type DecodeFn } from "./sample-cache";
import { PIANO_PACK } from "./packs/piano";
import { VIOLAO_PACK } from "./packs/violao";
import { DRUMS_PACK } from "./packs/drums";

export type SampleInstrumentId = "piano" | "violao" | "drums";

export const SAMPLE_INSTRUMENTS: readonly SampleInstrumentId[] = ["piano", "violao", "drums"] as const;

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
  if (id === "piano") {
    return {
      instrument: id,
      packId: PIANO_PACK.packId,
      license: PIANO_PACK.license,
      attribution: PIANO_PACK.attribution,
      moreInfoUrl: PIANO_PACK.moreInfoUrl,
      bytesEstimate: PIANO_PACK.totalBytesEstimate,
      urls: PIANO_PACK.notes.map((n) => n.url),
    };
  }
  if (id === "violao") {
    return {
      instrument: id,
      packId: VIOLAO_PACK.packId,
      license: VIOLAO_PACK.license,
      attribution: VIOLAO_PACK.attribution,
      moreInfoUrl: VIOLAO_PACK.moreInfoUrl,
      bytesEstimate: VIOLAO_PACK.totalBytesEstimate,
      urls: VIOLAO_PACK.notes.map((n) => n.url),
    };
  }
  return {
    instrument: id,
    packId: DRUMS_PACK.packId,
    license: DRUMS_PACK.license,
    attribution: DRUMS_PACK.attribution,
    moreInfoUrl: DRUMS_PACK.moreInfoUrl,
    bytesEstimate: DRUMS_PACK.totalBytesEstimate,
    urls: DRUMS_PACK.voices.map((v) => v.url),
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
  return { piano: true, violao: true, drums: true };
}

export function loadUseRealPrefs(): UseRealPrefs {
  const fallback = defaultUseRealPrefs();
  try {
    const raw = globalThis.localStorage?.getItem(config.instruments.samples.toggleStorageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UseRealPrefs>;
    return {
      piano: typeof parsed.piano === "boolean" ? parsed.piano : fallback.piano,
      violao: typeof parsed.violao === "boolean" ? parsed.violao : fallback.violao,
      drums: typeof parsed.drums === "boolean" ? parsed.drums : fallback.drums,
    };
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
 * Phase 17: after the microphone is first activated, suggest the real-sound
 * packs once (non-intrusive, dismissible, consent-first). Pure decision so
 * the UI layer only renders `shouldSuggestSamples(...) === true`.
 */
export function shouldSuggestSamples(args: {
  micActive: boolean;
  anyPackReady: boolean;
  dismissed: boolean;
}): boolean {
  return args.micActive && !args.anyPackReady && !args.dismissed;
}

/** Has the user already seen/dismissed the post-mic sample suggestion? */
export function samplesSuggestionDismissed(): boolean {
  try {
    // No storage (SSR, privacy mode) → treat as dismissed and never nag.
    if (!globalThis.localStorage) return true;
    return globalThis.localStorage.getItem(config.instruments.samples.promptStorageKey) === "1";
  } catch {
    return true;
  }
}

/** Remember that the user saw the suggestion (best-effort persistence). */
export function dismissSamplesSuggestion(): void {
  try {
    globalThis.localStorage?.setItem(config.instruments.samples.promptStorageKey, "1");
  } catch {
    // Best-effort; the in-memory hook state still hides the banner.
  }
}

/**
 * Live in-memory flags read per-note by `SampleVoice` (cheap, no
 * localStorage IO on the audio path). The hook keeps these + persisted
 * prefs in sync; sinks are built once and react instantly to toggles.
 */
const liveFlags: Record<SampleInstrumentId, boolean> = {
  piano: true,
  violao: true,
  drums: true,
};

let flagsSynced = false;

export function syncSampleFlags(prefs: UseRealPrefs): void {
  liveFlags.piano = prefs.piano;
  liveFlags.violao = prefs.violao;
  liveFlags.drums = prefs.drums;
  flagsSynced = true;
}

export function setSampleEnabled(id: SampleInstrumentId, v: boolean): void {
  liveFlags[id] = v;
}

export function isSampleEnabled(id: SampleInstrumentId): boolean {
  if (!flagsSynced) {
    try {
      const prefs = loadUseRealPrefs();
      liveFlags.piano = prefs.piano;
      liveFlags.violao = prefs.violao;
      liveFlags.drums = prefs.drums;
      flagsSynced = true;
    } catch {
      // Defaults stand.
    }
  }
  return liveFlags[id];
}

/** True when every pack URL is decoded and ready (no network needed). */
export function isPackReady(id: SampleInstrumentId, cache: SampleCache = getSampleCache()): boolean {
  const meta = packMetaOf(id);
  return meta.urls.every((u) => cache.has(u));
}
