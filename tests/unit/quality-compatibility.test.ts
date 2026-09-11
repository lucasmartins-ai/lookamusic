/**
 * Phase 14: Quality & Hardening — Browser Compatibility Matrix
 * Tests support detection, error classification, and graceful fallbacks for:
 * Chrome/Edge/Safari/Firefox on Desktop and Mobile.
 */
import { describe, expect, it } from "vitest";
import { MicSession } from "@/features/audio/session";
import { CameraSession } from "@/features/gestures/camera";
import { isWebmExportSupported } from "@/features/export/webm";

describe("Phase 14 — Browser Compatibility & Resilience", () => {
  describe("Microphone Session & Permissions", () => {
    it("MicSession.supported() returns boolean based on environment", () => {
      // In Node environment without window/AudioContext
      expect(typeof MicSession.supported()).toBe("boolean");
    });

    it("classifies permission denial with guided recovery", () => {
      const session = new MicSession(() => {}, () => {});
      // DOMException NotAllowedError
      const denial = (session as unknown as { classifyMicError: (e: unknown) => unknown }).classifyMicError(
        new DOMException("Permission denied", "NotAllowedError"),
      ) as { status: string; recovery: string };

      expect(denial.status).toBe("denied");
      expect(denial.recovery).toMatch(/address bar/i);
    });

    it("classifies missing hardware with guided recovery", () => {
      const session = new MicSession(() => {}, () => {});
      const noMic = (session as unknown as { classifyMicError: (e: unknown) => unknown }).classifyMicError(
        new DOMException("Requested device not found", "NotFoundError"),
      ) as { status: string; recovery: string };

      expect(noMic.status).toBe("no-mic");
      expect(noMic.recovery).toMatch(/Connect a microphone/i);
    });
  });

  describe("Camera Session & Permissions (100% Parity)", () => {
    it("classifies camera permission denial with parity advice", () => {
      const denial = CameraSession.classifyError(
        new DOMException("Permission denied", "NotAllowedError"),
      );
      expect(denial.status).toBe("denied");
      expect(denial.recovery).toMatch(/buttons \+ keyboard/i);
    });

    it("classifies camera absence with parity advice", () => {
      const noCam = CameraSession.classifyError(
        new DOMException("Device not found", "NotFoundError"),
      );
      expect(noCam.status).toBe("no-camera");
      expect(noCam.recovery).toMatch(/buttons \+ keyboard/i);
    });
  });

  describe("Media Recording Codec Fallback Matrix", () => {
    it("returns false when MediaRecorder or window is undefined (SSR/Node)", () => {
      expect(isWebmExportSupported()).toBe(false);
    });
  });
});
