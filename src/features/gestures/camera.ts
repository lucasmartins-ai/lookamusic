/**
 * Camera session controller (Phase 9, §43/§46) — application layer.
 * Owns getUserMedia(video) → HTMLVideoElement lifecycle. No React
 * imports. No landmarks, no recognition, no synthesis here.
 *
 * Privacy (normative): frames are classified in memory on-device and
 * NEVER leave the device, are NEVER recorded, uploaded, or persisted.
 * The stream carries video only (no audio) and is torn down on stop /
 * unmount. Denial keeps full UI parity: every gesture action exists as
 * a button + keyboard shortcut, so the camera is always optional.
 *
 * Mirrors `features/audio/session.ts` (MicSession) status/recovery
 * shape so permission UI stays consistent between mic and camera.
 */
export type CameraStatus =
  | "idle"
  | "requesting"
  | "running"
  | "denied"
  | "no-camera"
  | "unsupported"
  | "error";

export interface CameraError {
  status: Exclude<CameraStatus, "idle" | "requesting" | "running">;
  message: string;
  recovery: string;
}

export class CameraSession {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  constructor(
    private readonly onStatus: (s: CameraStatus, err?: CameraError) => void,
  ) {}

  static supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof document !== "undefined" &&
      typeof document.createElement === "function"
    );
  }

  /** Attach the live preview element; resolves when frames are flowing. */
  async start(video: HTMLVideoElement): Promise<void> {
    if (!CameraSession.supported()) {
      this.onStatus("unsupported", {
        status: "unsupported",
        message: "This browser cannot access the camera.",
        recovery: "Use a recent Chrome, Edge, Safari or Firefox on desktop, or keep conducting with buttons + keyboard.",
      });
      return;
    }
    this.onStatus("requesting");
    try {
      // Video only — never request audio here (the mic has its own flow).
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
    } catch (e) {
      this.onStatus(CameraSession.classifyError(e).status, CameraSession.classifyError(e));
      return;
    }
    try {
      this.video = video;
      video.srcObject = this.stream;
      video.muted = true;
      await video.play();
      this.onStatus("running");
    } catch (e) {
      await this.teardown();
      this.onStatus("error", {
        status: "error",
        message: e instanceof Error ? e.message : "Could not start the camera preview.",
        recovery: "Reload the page and try again. Buttons + keyboard keep working meanwhile.",
      });
    }
  }

  async stop(): Promise<void> {
    await this.teardown();
    this.onStatus("idle");
  }

  get active(): boolean {
    return this.stream !== null;
  }

  static classifyError(e: unknown): CameraError {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        status: "denied",
        message: "Camera permission was denied.",
        recovery:
          "Allow camera access in the browser address bar, then press Start again — or keep conducting with buttons + keyboard (full parity).",
      };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return {
        status: "no-camera",
        message: "No camera was found.",
        recovery:
          "Connect a camera and try again — or keep conducting with buttons + keyboard (full parity).",
      };
    }
    if (name === "NotReadableError" || name === "AbortError") {
      return {
        status: "error",
        message: "The camera is busy or unreadable.",
        recovery: "Close other apps using the camera, then press Start again.",
      };
    }
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Could not open the camera.",
      recovery: "Close other apps using the camera, then press Start again.",
    };
  }

  private async teardown(): Promise<void> {
    try {
      if (this.video) {
        this.video.pause();
        this.video.srcObject = null;
      }
    } catch {
      // ignore
    }
    this.stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    this.video = null;
    this.stream = null;
  }
}
