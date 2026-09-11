/**
 * CameraSession: permission flow + guided recovery (Phase 9, §43/§46).
 * No DOM, no stream in Node — error taxonomy + lifecycle only. Run:
 * npm test -- gestures-camera
 */
import { describe, expect, it } from "vitest";
import { CameraSession } from "@/features/gestures/camera";

function domError(name: string, message = "denied"): DOMException {
  return new DOMException(message, name);
}

describe("supported()", () => {
  it("is false off-browser (Node has no mediaDevices)", () => {
    expect(CameraSession.supported()).toBe(false);
  });
});

describe("error taxonomy → guided recovery", () => {
  it("denial maps to denied with a parity recovery path", () => {
    for (const name of ["NotAllowedError", "SecurityError"]) {
      const err = CameraSession.classifyError(domError(name));
      expect(err.status).toBe("denied");
      expect(err.recovery).toMatch(/keyboard/i);
    }
  });

  it("missing hardware maps to no-camera", () => {
    for (const name of ["NotFoundError", "OverconstrainedError"]) {
      expect(CameraSession.classifyError(domError(name)).status).toBe("no-camera");
    }
  });

  it("busy devices and unknown failures map to error (never silent)", () => {
    expect(CameraSession.classifyError(domError("NotReadableError")).status).toBe("error");
    expect(CameraSession.classifyError(new Error("boom")).status).toBe("error");
    expect(CameraSession.classifyError("weird").status).toBe("error");
    for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError"]) {
      expect(CameraSession.classifyError(domError(name)).recovery.length).toBeGreaterThan(0);
    }
  });
});

describe("lifecycle off-browser", () => {
  it("start() reports unsupported instead of throwing", async () => {
    const seen: string[] = [];
    const session = new CameraSession((s) => seen.push(s));
    // @ts-expect-error — no video element in Node; unsupported short-circuits first
    await session.start(undefined);
    expect(seen).toEqual(["unsupported"]);
    expect(session.active).toBe(false);
  });

  it("stop() on an idle session is a quiet no-op to idle", async () => {
    const seen: string[] = [];
    const session = new CameraSession((s) => seen.push(s));
    await session.stop();
    expect(seen).toEqual(["idle"]);
  });
});
