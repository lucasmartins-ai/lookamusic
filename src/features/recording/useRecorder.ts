"use client";

/**
 * useRecorder hook (Phase 11).
 * Bridges SessionRecorder and storage with React components.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { bus } from "@/lib/events";
import type { Composition } from "@/domain/types";
import { SessionRecorder } from "./capture";
import {
  type CompositionSummary,
  listCompositions,
  loadComposition,
  saveComposition,
  deleteComposition as deleteStorageComposition,
} from "./storage";

export function useRecorder() {
  const recorderRef = useRef<SessionRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [lastComposition, setLastComposition] = useState<Composition | null>(null);
  const [compositions, setCompositions] = useState<CompositionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Initialize recorder with global event bus
  if (!recorderRef.current) {
    recorderRef.current = new SessionRecorder({ bus });
  }

  const refreshList = useCallback(async () => {
    try {
      const items = await listCompositions();
      setCompositions(items);
    } catch {
      // Storage error handled silently or with empty list
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const startRecording = useCallback((customId?: string) => {
    if (!recorderRef.current) return;
    const sid = recorderRef.current.start(customId);
    setIsRecording(true);
    setCurrentSessionId(sid);
  }, []);

  const stopRecording = useCallback(
    async (customName?: string): Promise<Composition | null> => {
      if (!recorderRef.current || !recorderRef.current.isRecording) return null;
      try {
        setLoading(true);
        const comp = recorderRef.current.stop();
        if (customName) {
          comp.name = customName;
        }
        await saveComposition(comp);
        setLastComposition(comp);
        setIsRecording(false);
        setCurrentSessionId(null);
        await refreshList();
        return comp;
      } finally {
        setLoading(false);
      }
    },
    [refreshList],
  );

  const save = useCallback(
    async (comp: Composition) => {
      setLoading(true);
      try {
        await saveComposition(comp);
        setLastComposition(comp);
        await refreshList();
      } finally {
        setLoading(false);
      }
    },
    [refreshList],
  );

  const load = useCallback(async (id: string): Promise<Composition | null> => {
    setLoading(true);
    try {
      const loaded = await loadComposition(id);
      if (loaded) {
        setLastComposition(loaded);
      }
      return loaded;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        await deleteStorageComposition(id);
        if (lastComposition?.id === id) {
          setLastComposition(null);
        }
        await refreshList();
      } finally {
        setLoading(false);
      }
    },
    [lastComposition?.id, refreshList],
  );

  return {
    isRecording,
    sessionId: currentSessionId,
    lastComposition,
    compositions,
    loading,
    startRecording,
    stopRecording,
    save,
    load,
    remove,
    refreshList,
  };
}
