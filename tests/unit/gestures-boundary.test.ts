/**
 * Gesture boundary (Phase 9, §53): vision NEVER reaches synthesis.
 * `features/gestures` may depend on domain/config/lib/events only —
 * any import of instrument engines, Web Audio, or network upload is a
 * boundary violation. Run: npm test -- gestures-boundary
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "features", "gestures");
const FILES = ["recognition.ts", "landmarks.ts", "mapping.ts", "camera.ts", "useGestures.ts"];

function src(name: string): string {
  return readFileSync(join(DIR, name), "utf8");
}

/** Module paths that would couple vision to synthesis. */
const FORBIDDEN_MODULES = ["features/instruments", "audio-sink", "instruments/"];

/** Runtime globals for sound output / upload. */
const FORBIDDEN_GLOBALS = [
  "AudioContext",
  "AudioWorklet",
  "OscillatorNode",
  "WebAudioSink",
  "XMLHttpRequest",
  "sendBeacon",
];

/** Static + dynamic import specifiers in a source file. */
function specifiers(text: string): string[] {
  const stat = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  const dyn = [...text.matchAll(/import\(\s*([^)]+)\)/g)].map((m) => m[1]);
  return [...stat, ...dyn];
}

describe("gestures → instruments isolation", () => {
  for (const file of FILES) {
    it(`${file} imports no synthesis module`, () => {
      for (const spec of specifiers(src(file))) {
        for (const needle of FORBIDDEN_MODULES) {
          expect(spec, `${file} must not import ${needle}`).not.toContain(needle);
        }
      }
    });

    it(`${file} touches no audio/upload global`, () => {
      const text = src(file);
      for (const needle of FORBIDDEN_GLOBALS) {
        expect(text, `${file} must not reference ${needle}`).not.toContain(needle);
      }
    });
  }

  it("mapping routes through an intent + sink (no .schedule call anywhere)", () => {
    for (const file of FILES) {
      expect(src(file), file).not.toContain(".schedule(");
    }
  });

  it("only domain/config/lib/events/rhythm-energy imports (no feature cross-talk)", () => {
    const allowed = [
      "@/domain/",
      "@/lib/",
      "@/features/gestures/",
      "@/features/music/rhythm/energy",
      "@mediapipe/",
      "react",
    ];
    for (const file of FILES) {
      const imports = [...src(file).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const imp of imports) {
        const ok = imp.startsWith(".") || allowed.some((a) => imp === a || imp.startsWith(a));
        expect(ok, `${file} imports forbidden module ${imp}`).toBe(true);
      }
    }
  });
});
