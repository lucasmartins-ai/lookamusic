/**
 * useSamplePacks — application-layer hook for Phase 16 sample packs.
 * Business logic lives here (and in `sample-store.ts`); components only
 * render. Downloads run ONLY on user action, with progress + clear offline
 * state. Default: real sound when the pack exists.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { getSampleCache, isPackReady, loadUseRealPrefs, packMetaOf, saveUseRealPrefs,
  SAMPLE_INSTRUMENTS, ensureSampleDecoder, syncSampleFlags, setSampleEnabled, defaultUseRealPrefs,
  samplesSuggestionDismissed, dismissSamplesSuggestion, shouldSuggestSamples,
  type SampleInstrumentId, type UseRealPrefs } from "./sample-store";

export type PackStatus = "idle" | "downloading" | "ready" | "error" | "offline";

export interface PackState {
  instrument: SampleInstrumentId;
  useReal: boolean;
  status: PackStatus;
  progress: number;
  error: string | null;
  bytesEstimate: number;
  license: string;
}

function initialStates(prefs: UseRealPrefs): Record<SampleInstrumentId, PackState> {
  const cache = getSampleCache();
  const out = {} as Record<SampleInstrumentId, PackState>;
  for (const id of SAMPLE_INSTRUMENTS) {
    const meta = packMetaOf(id);
    out[id] = {
      instrument: id,
      useReal: prefs[id],
      status: isPackReady(id, cache) ? "ready" : "idle",
      progress: isPackReady(id, cache) ? 1 : 0,
      error: null,
      bytesEstimate: meta.bytesEstimate,
      license: meta.license,
    };
  }
  return out;
}

export function useSamplePacks() {
  // SSR-first: the first render is always defaults (server has no
  // localStorage/navigator); stored prefs + cached-ready flags sync in the
  // mount effect below, so hydration never mismatches.
  const [prefs, setPrefs] = useState<UseRealPrefs>(() => defaultUseRealPrefs());
  const [states, setStates] = useState<Record<SampleInstrumentId, PackState>>(() => initialStates(defaultUseRealPrefs()));
  // SSR-first: identical first render on server and client (navigator
  // differs); the real online state syncs in an effect below.
  const [online, setOnline] = useState<boolean>(true);
  // Phase 17: post-mic pack suggestion (SSR-first default = not dismissed;
  // storage syncs in the mount effect below, like the other prefs).
  const [suggestionDismissed, setSuggestionDismissed] = useState<boolean>(false);

  // Mount-only sync: stored prefs + cached-ready flags + online state.
  // (Effects never run on the server, so hydration always matches.)
  useEffect(() => {
    const stored = loadUseRealPrefs();
    syncSampleFlags(stored);
    setPrefs(stored);
    setStates(initialStates(stored));
    setSuggestionDismissed(samplesSuggestionDismissed());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const setUseReal = useCallback((id: SampleInstrumentId, v: boolean) => {
    setSampleEnabled(id, v);
    setPrefs((prev) => {
      const next = { ...prev, [id]: v };
      saveUseRealPrefs(next);
      return next;
    });
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], useReal: v } }));
  }, []);

  const download = useCallback(async (id: SampleInstrumentId) => {
    const meta = packMetaOf(id);
    const cache = getSampleCache();
    if (isPackReady(id, cache)) {
      setStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "ready", progress: 1, error: null } }));
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "offline", error: "Sem conexão — conecte-se para baixar o pack." } }));
      return;
    }
    if (!ensureSampleDecoder()) {
      setStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "error", error: "Decodificação indisponível neste navegador." } }));
      return;
    }
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "downloading", progress: 0, error: null } }));
    try {
      const result = await cache.downloadPack(meta.urls, (done, total) => {
        setStates((prev) => ({ ...prev, [id]: { ...prev[id], progress: total > 0 ? done / total : 0 } }));
      });
      if (result.failed.length > 0 && result.ok.length === 0) {
        setStates((prev) => ({
          ...prev,
          [id]: { ...prev[id], status: "error", error: `Falha no download (${result.failed.length}/${meta.urls.length}). Tente de novo — a síntese segue ativa.` },
        }));
        return;
      }
      setStates((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: "ready",
          progress: result.ok.length / meta.urls.length,
          error: result.failed.length > 0 ? `${result.failed.length} sample(s) em fallback (síntese).` : null,
        },
      }));
    } catch (e) {
      setStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: "error", error: e instanceof Error ? e.message : "Falha no download." },
      }));
    }
  }, []);

  /** True once at least one real-sound pack is fully decoded (no network). */
  const hasReadyPack = SAMPLE_INSTRUMENTS.some((id) => isPackReady(id));

  const dismissSuggestion = useCallback(() => {
    dismissSamplesSuggestion();
    setSuggestionDismissed(true);
  }, []);

  /**
   * Phase 17: should the post-mic banner suggest the real-sound packs?
   * Only while the mic is active, no pack is downloaded, and the user has
   * not dismissed it before.
   */
  const suggestPackForMic = useCallback(
    (micActive: boolean) =>
      shouldSuggestSamples({ micActive, anyPackReady: hasReadyPack, dismissed: suggestionDismissed }),
    [hasReadyPack, suggestionDismissed],
  );

  return {
    packs: SAMPLE_INSTRUMENTS.map((id) => states[id]),
    states,
    prefs,
    online,
    hasReadyPack,
    suggestionDismissed,
    suggestPackForMic,
    dismissSuggestion,
    setUseReal,
    download,
  };
}
