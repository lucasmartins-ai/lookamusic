/**
 * useSamplePacks — application-layer hook for the real-sound packs (Phase 16).
 * Business logic lives here (and in `sample-store.ts`); components only render.
 *
 * v1.3.3 (pedido do usuário: "quero que venha já instalado"): os packs são
 * **empacotados no app** e decodificados automaticamente no primeiro uso, da
 * mesma origem — não existe mais botão de download, consentimento nem estado
 * offline. Enquanto um buffer não está pronto, o engine toca o **modelo
 * nativo**; quando ele chega, as notas seguintes já saem em sample. Nada
 * bloqueia a banda e nada pede clique.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  canAutoLoadPacks,
  defaultUseRealPrefs,
  ensureSampleDecoder,
  getSampleCache,
  isPackReady,
  loadUseRealPrefs,
  packMetaOf,
  SAMPLE_INSTRUMENTS,
  saveUseRealPrefs,
  setSampleEnabled,
  syncSampleFlags,
  type SampleInstrumentId,
  type UseRealPrefs,
} from "./sample-store";

export type PackStatus = "loading" | "ready" | "partial" | "unavailable";

export interface PackState {
  instrument: SampleInstrumentId;
  useReal: boolean;
  status: PackStatus;
  /** 0–1 decode progress for this instrument. */
  progress: number;
  /** Bundled samples that failed to decode (rest keeps the native model). */
  missing: number;
  bytesEstimate: number;
  license: string;
}

function initialStates(prefs: UseRealPrefs): Record<SampleInstrumentId, PackState> {
  const cache = getSampleCache();
  const out = {} as Record<SampleInstrumentId, PackState>;
  for (const id of SAMPLE_INSTRUMENTS) {
    const meta = packMetaOf(id);
    const ready = isPackReady(id, cache);
    out[id] = {
      instrument: id,
      useReal: prefs[id],
      status: ready ? "ready" : "loading",
      progress: ready ? 1 : 0,
      missing: 0,
      bytesEstimate: meta.bytesEstimate,
      license: meta.license,
    };
  }
  return out;
}

export function useSamplePacks() {
  // SSR-first: the first render is always defaults (server has no
  // localStorage); stored prefs + cached-ready flags sync in the mount
  // effect below, so hydration never mismatches.
  const [prefs, setPrefs] = useState<UseRealPrefs>(() => defaultUseRealPrefs());
  const [states, setStates] = useState<Record<SampleInstrumentId, PackState>>(() =>
    initialStates(defaultUseRealPrefs()),
  );

  const patch = useCallback((id: SampleInstrumentId, next: Partial<PackState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }, []);

  /**
   * Decode every bundled pack from the same origin. No user action, no
   * network dependency beyond the app's own files; a failure simply leaves
   * that instrument on its native model (never silence, never a modal).
   */
  const loadAll = useCallback(async () => {
    if (!canAutoLoadPacks()) {
      for (const id of SAMPLE_INSTRUMENTS) {
        if (!isPackReady(id)) patch(id, { status: "unavailable", progress: 0 });
      }
      return;
    }
    const cache = getSampleCache();
    for (const id of SAMPLE_INSTRUMENTS) {
      if (isPackReady(id, cache)) {
        patch(id, { status: "ready", progress: 1, missing: 0 });
        continue;
      }
      const meta = packMetaOf(id);
      const result = await cache.loadPack(meta.urls, (done, total) => {
        patch(id, { progress: total > 0 ? done / total : 0 });
      });
      const missing = result.failed.length;
      patch(id, {
        status: result.ok.length === 0 ? "unavailable" : missing > 0 ? "partial" : "ready",
        progress: result.ok.length / Math.max(1, meta.urls.length),
        missing,
      });
    }
  }, [patch]);

  // Mount-only sync: stored prefs + cached-ready flags, then the automatic
  // decode of the bundled packs. (Effects never run on the server, so
  // hydration always matches.)
  useEffect(() => {
    const stored = loadUseRealPrefs();
    syncSampleFlags(stored);
    ensureSampleDecoder();
    setPrefs(stored);
    setStates(initialStates(stored));
    void loadAll();
  }, [loadAll]);

  const setUseReal = useCallback((id: SampleInstrumentId, v: boolean) => {
    setSampleEnabled(id, v);
    setPrefs((prev) => {
      const next = { ...prev, [id]: v };
      saveUseRealPrefs(next);
      return next;
    });
    patch(id, { useReal: v });
  }, [patch]);

  const packs = SAMPLE_INSTRUMENTS.map((id) => states[id]);
  const loadedCount = packs.filter((p) => p.status === "ready" || p.status === "partial").length;

  return {
    packs,
    states,
    prefs,
    loadedCount,
    setUseReal,
  };
}
