/**
 * Microphone session controller — application layer (§7, §43).
 * Owns getUserMedia → AudioContext → AudioWorkletNode lifecycle.
 * No React imports. Emits compact observations; never raw samples.
 */
import type { KeyEstimate, PitchObservation } from "@/domain/types";
import { AutotuneController } from "./autotune";

export type SessionStatus =
  | "idle"
  | "requesting"
  | "running"
  | "denied"
  | "no-mic"
  | "suspended"
  | "unsupported"
  | "error";

export interface SessionError {
  status: Exclude<SessionStatus, "idle" | "requesting" | "running">;
  message: string;
  recovery: string;
}

export interface SessionDiagnostics {
  /** observations received per second */
  obsRateHz: number;
  /** main-thread handle time (message → processed) */
  avgHandleMs: number;
  p95HandleMs: number;
  /** sequence gaps from the worklet */
  droppedFrames: number;
  /** output base latency reported by the context, if available */
  outputLatencyMs: number | null;
  /** latest input RMS */
  inputRms: number;
}

interface WorkletMsg {
  frequency: number;
  midiNote: number;
  confidence: number;
  clarity: number;
  timestamp: number; // audio-clock ms
  seq: number;
  rms: number;
}

const DIAG_WINDOW = 120;

export class MicSession {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private handleTimes: number[] = [];
  private lastSeq = -1;
  private dropped = 0;
  private received = 0;
  private windowStart = 0;
  private lastRms = 0;
  private stopped = false;
  readonly autotune = new AutotuneController();
  private currentKey: KeyEstimate | null = null;

  constructor(
    private readonly onObservation: (obs: PitchObservation) => void,
    private readonly onStatus: (s: SessionStatus, err?: SessionError) => void,
  ) {}

  setKey(key: KeyEstimate | null): void {
    this.currentKey = key;
  }

  static supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioContext !== "undefined"
    );
  }

  async start(): Promise<void> {
    if (!MicSession.supported()) {
      this.onStatus(
        "unsupported",
        {
          status: "unsupported",
          message: "This browser cannot access the microphone or AudioWorklets.",
          recovery: "Use a recent Chrome, Edge, Safari or Firefox on desktop.",
        },
      );
      return;
    }
    this.stopped = false;
    this.onStatus("requesting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Hum-first: a banda toca nos alto-falantes enquanto o mic fica
          // aberto (play-along). Sem echoCancellation o mic recaptura a
          // própria banda → notas rápidas/fantasmas + lag em cascata.
          // noiseSuppression ajuda o detector; autoGain fica fora para
          // preservar a dinâmica do canto (pitch/energia estáveis).
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
    } catch (e) {
      this.fail(this.classifyMicError(e));
      return;
    }

    try {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      if (this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          // fall through to suspended status below
        }
      }
      if (this.ctx.state === "suspended") {
        this.onStatus("suspended", {
          status: "suspended",
          message: "Audio output is suspended by the browser.",
          recovery: "Tap Start again — audio must resume from a user gesture.",
        });
        await this.teardown();
        return;
      }
      await this.ctx.audioWorklet.addModule("/worklets/pitch-processor.js");
      try {
        await this.ctx.audioWorklet.addModule("/worklets/autotune-processor.js");
      } catch {
        // Autotune worklet module is optional
      }
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.ctx, "looka-pitch", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      });
      this.windowStart = performance.now();
      this.node.port.onmessage = (ev: MessageEvent<WorkletMsg>) => this.handleMessage(ev.data);
      this.source.connect(this.node);
      this.autotune.attach(this.ctx, this.source);
      this.onStatus("running");
    } catch (e) {
      this.fail({
        status: "error",
        message: e instanceof Error ? e.message : "Audio engine failed to start.",
        recovery: "Reload the page and try again. If it persists, try another browser.",
      });
      await this.teardown();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.teardown();
    this.onStatus("idle");
  }

  snapshotDiagnostics(): SessionDiagnostics {
    const times = [...this.handleTimes].sort((a, b) => a - b);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const p95 = times.length ? times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] : 0;
    const elapsed = (performance.now() - this.windowStart) / 1000;
    const ctx = this.ctx;
    const outputLatencyMs =
      ctx && typeof ctx.outputLatency === "number" ? ctx.outputLatency * 1000 : null;
    return {
      obsRateHz: elapsed > 0 ? this.received / elapsed : 0,
      avgHandleMs: avg,
      p95HandleMs: p95,
      droppedFrames: this.dropped,
      outputLatencyMs,
      inputRms: this.lastRms,
    };
  }

  private handleMessage(msg: WorkletMsg): void {
    if (this.stopped) return;
    const t0 = performance.now();
    if (this.lastSeq >= 0 && msg.seq > this.lastSeq + 1) {
      this.dropped += msg.seq - this.lastSeq - 1;
    }
    this.lastSeq = msg.seq;
    this.received += 1;
    this.lastRms = msg.rms;
    const obs: PitchObservation = {
      frequency: msg.frequency,
      midiNote: msg.midiNote,
      confidence: msg.confidence,
      clarity: msg.clarity,
      timestamp: performance.now(),
    };
    this.onObservation(obs);
    this.autotune.processObservation(obs, this.currentKey);
    const dt = performance.now() - t0;
    this.handleTimes.push(dt);
    if (this.handleTimes.length > DIAG_WINDOW) this.handleTimes.shift();
  }

  private classifyMicError(e: unknown): SessionError {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        status: "denied",
        message: "Microphone permission was denied.",
        recovery: "Allow microphone access in the browser address bar, then press Start again.",
      };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return {
        status: "no-mic",
        message: "No microphone was found.",
        recovery: "Connect a microphone, check system input settings, then press Start again.",
      };
    }
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Could not open the microphone.",
      recovery: "Close other apps using the mic, then press Start again.",
    };
  }

  private fail(err: SessionError): void {
    void this.teardown();
    this.onStatus(err.status, err);
  }

  private async teardown(): Promise<void> {
    this.autotune.detach();
    try {
      this.node?.port.close();
      this.node?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.source?.disconnect();
    } catch {
      // ignore
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        // ignore
      }
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.source = null;
    this.ctx = null;
    this.stream = null;
  }
}
