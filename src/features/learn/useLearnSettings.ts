"use client";

/**
 * useLearnSettings — persistent settings for Educational Mode (Phase 13, §4 & Hardening).
 * Manages the global on/off toggle, active learning level, screen reader verbosity,
 * and locale (pt-BR / en-US).
 * SSR-safe with localStorage caching and cross-tab synchronization.
 */

import { useCallback, useEffect, useState } from "react";
import { config } from "@/lib/config";
import type { LearnLevel, LearnSettings, SupportedLocale } from "./types";

const memoryStore: Record<string, string> = {};

export function readLearnEnabled(): boolean {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      const raw = localStorage.getItem(config.learn.storageKey);
      return raw !== null ? raw === "true" : config.learn.defaultEnabled;
    }
  } catch {
    // quota or private mode fallback
  }
  const mem = memoryStore[config.learn.storageKey];
  return mem !== undefined ? mem === "true" : config.learn.defaultEnabled;
}

export function writeLearnEnabled(val: boolean): void {
  const str = val ? "true" : "false";
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem(config.learn.storageKey, str);
    }
  } catch {
    // quota or private mode fallback
  }
  memoryStore[config.learn.storageKey] = str;
}

export function readLearnLevel(): LearnLevel {
  let val: string | null = null;
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      val = localStorage.getItem(config.learn.levelStorageKey);
    }
  } catch {
    // fallback
  }
  if (!val) {
    val = memoryStore[config.learn.levelStorageKey] ?? null;
  }
  if (
    val === "notes" ||
    val === "intervals" ||
    val === "scales" ||
    val === "chords" ||
    val === "functions" ||
    val === "progressions" ||
    val === "cadence" ||
    val === "voiceLeading" ||
    val === "modulation"
  ) {
    return val;
  }
  return config.learn.defaultLevel as LearnLevel;
}

export function writeLearnLevel(lvl: LearnLevel): void {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem(config.learn.levelStorageKey, lvl);
    }
  } catch {
    // fallback
  }
  memoryStore[config.learn.levelStorageKey] = lvl;
}

export function readScreenReaderAnnounce(): boolean {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      const raw = localStorage.getItem(config.learn.screenReaderStorageKey);
      return raw !== null ? raw === "true" : config.learn.defaultScreenReaderAnnounce;
    }
  } catch {
    // fallback
  }
  const mem = memoryStore[config.learn.screenReaderStorageKey];
  return mem !== undefined ? mem === "true" : config.learn.defaultScreenReaderAnnounce;
}

export function writeScreenReaderAnnounce(val: boolean): void {
  const str = val ? "true" : "false";
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem(config.learn.screenReaderStorageKey, str);
    }
  } catch {
    // fallback
  }
  memoryStore[config.learn.screenReaderStorageKey] = str;
}

export function readLearnLocale(): SupportedLocale {
  let val: string | null = null;
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      val = localStorage.getItem(config.learn.localeStorageKey);
    }
  } catch {
    // fallback
  }
  if (!val) {
    val = memoryStore[config.learn.localeStorageKey] ?? null;
  }
  if (val === "pt-BR" || val === "en-US") {
    return val;
  }
  return config.learn.defaultLocale as SupportedLocale;
}

export function writeLearnLocale(loc: SupportedLocale): void {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem(config.learn.localeStorageKey, loc);
    }
  } catch {
    // fallback
  }
  memoryStore[config.learn.localeStorageKey] = loc;
}

export function useLearnSettings(): LearnSettings & {
  setEnabled: (v: boolean) => void;
  toggleEnabled: () => void;
  setLevel: (lvl: LearnLevel) => void;
  setScreenReaderAnnounce: (v: boolean) => void;
  toggleScreenReaderAnnounce: () => void;
  setLocale: (loc: SupportedLocale) => void;
} {
  const [enabled, setEnabledState] = useState<boolean>(() => readLearnEnabled());
  const [level, setLevelState] = useState<LearnLevel>(() => readLearnLevel());
  const [screenReaderAnnounce, setScreenReaderAnnounceState] = useState<boolean>(() =>
    readScreenReaderAnnounce(),
  );
  const [locale, setLocaleState] = useState<SupportedLocale>(() => readLearnLocale());

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    writeLearnEnabled(v);
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      writeLearnEnabled(next);
      return next;
    });
  }, []);

  const setLevel = useCallback((lvl: LearnLevel) => {
    setLevelState(lvl);
    writeLearnLevel(lvl);
  }, []);

  const setScreenReaderAnnounce = useCallback((v: boolean) => {
    setScreenReaderAnnounceState(v);
    writeScreenReaderAnnounce(v);
  }, []);

  const toggleScreenReaderAnnounce = useCallback(() => {
    setScreenReaderAnnounceState((prev) => {
      const next = !prev;
      writeScreenReaderAnnounce(next);
      return next;
    });
  }, []);

  const setLocale = useCallback((loc: SupportedLocale) => {
    setLocaleState(loc);
    writeLearnLocale(loc);
  }, []);

  // Sync between tabs/windows if storage event fires
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === config.learn.storageKey && e.newValue !== null) {
        setEnabledState(e.newValue === "true");
      } else if (e.key === config.learn.levelStorageKey && e.newValue !== null) {
        setLevelState(e.newValue as LearnLevel);
      } else if (e.key === config.learn.screenReaderStorageKey && e.newValue !== null) {
        setScreenReaderAnnounceState(e.newValue === "true");
      } else if (e.key === config.learn.localeStorageKey && e.newValue !== null) {
        setLocaleState(e.newValue as SupportedLocale);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return {
    enabled,
    level,
    screenReaderAnnounce,
    locale,
    setEnabled,
    toggleEnabled,
    setLevel,
    setScreenReaderAnnounce,
    toggleScreenReaderAnnounce,
    setLocale,
  };
}
