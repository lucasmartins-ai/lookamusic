import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  readLearnLocale,
  readScreenReaderAnnounce,
  writeLearnLocale,
  writeScreenReaderAnnounce,
} from "@/features/learn/useLearnSettings";

describe("Phase 13 Hardening (Risk 3) & Phase 15 (Risk 2) — Screen Reader & Locale Settings", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("defaults screenReaderAnnounce to false (off) to prevent acoustic overload", () => {
    expect(readScreenReaderAnnounce()).toBe(false);
  });

  it("persists screenReaderAnnounce state and updates correctly", () => {
    writeScreenReaderAnnounce(true);
    expect(readScreenReaderAnnounce()).toBe(true);

    writeScreenReaderAnnounce(false);
    expect(readScreenReaderAnnounce()).toBe(false);
  });

  it("defaults learn locale to pt-BR", () => {
    expect(readLearnLocale()).toBe("pt-BR");
  });

  it("persists locale switches (pt-BR <-> en-US)", () => {
    writeLearnLocale("en-US");
    expect(readLearnLocale()).toBe("en-US");

    writeLearnLocale("pt-BR");
    expect(readLearnLocale()).toBe("pt-BR");
  });

  it("falls back gracefully when localStorage contains unknown locale value", () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(config.learn.localeStorageKey, "fr-FR");
    }
    expect(readLearnLocale()).toBe("pt-BR");
  });
});
