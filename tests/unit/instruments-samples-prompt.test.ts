/**
 * Phase 17 — post-mic sample-pack suggestion (consent-first, once).
 * Run: npm test -- instruments-samples-prompt
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  shouldSuggestSamples,
  samplesSuggestionDismissed,
  dismissSamplesSuggestion,
} from "@/features/instruments/sample-store";
import { config } from "@/lib/config";

const KEY = config.instruments.samples.promptStorageKey;

interface StorageLike {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
}

const g = globalThis as { localStorage?: StorageLike };
let prev: StorageLike | undefined;

function stubStorage(): void {
  prev = g.localStorage;
  const map = new Map<string, string>();
  g.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

afterEach(() => {
  if (prev === undefined) delete g.localStorage;
  else g.localStorage = prev;
});

describe("shouldSuggestSamples", () => {
  it("suggests only while the mic is active, no pack is ready and not dismissed", () => {
    expect(shouldSuggestSamples({ micActive: true, anyPackReady: false, dismissed: false })).toBe(true);
  });

  it("never suggests before the mic is active", () => {
    expect(shouldSuggestSamples({ micActive: false, anyPackReady: false, dismissed: false })).toBe(false);
  });

  it("stops suggesting once any pack is ready", () => {
    expect(shouldSuggestSamples({ micActive: true, anyPackReady: true, dismissed: false })).toBe(false);
  });

  it("respects the dismissed flag", () => {
    expect(shouldSuggestSamples({ micActive: true, anyPackReady: false, dismissed: true })).toBe(false);
  });
});

describe("suggestion persistence", () => {
  it("defaults to not-dismissed, then remembers the dismissal", () => {
    stubStorage();
    expect(samplesSuggestionDismissed()).toBe(false);
    dismissSamplesSuggestion();
    expect(g.localStorage?.getItem(KEY)).toBe("1");
    expect(samplesSuggestionDismissed()).toBe(true);
  });

  it("treats missing storage as dismissed (never nags)", () => {
    delete g.localStorage;
    expect(samplesSuggestionDismissed()).toBe(true);
    expect(() => dismissSamplesSuggestion()).not.toThrow();
  });
});
