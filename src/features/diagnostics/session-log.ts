/**
 * Session diagnostics log (TDR-25). The user asked for every real usage to be
 * saved so the developer can follow it and tune ("salvar os logs sempre que eu
 * usar"). One folder per usage, written on THIS device only:
 *
 *   meta.json         app/config/mic settings (what the OS really applied)
 *   events.jsonl      every action (hum start, play, stop…) with timestamps
 *   observations.csv  every pitch reading (t, Hz, midi, confidence, rms, phase)
 *   notes.json        the notes the stabilizer produced for the take
 *   composition.json  what the band was told to play (tempo, chords, lineup)
 *   take.<ext>        the take audio exactly as the app heard it
 *
 * Pure apart from the injected `persist` (Tauri command in the desktop app;
 * no-op on the web). Never throws into the audio path.
 */
import { config } from "@/lib/config";
import type { PitchObservation } from "@/domain/types";

export type Persist = (session: string, name: string, data: Uint8Array) => Promise<string | null>;

/** Folder name for a usage, local time, filesystem-safe: 2026-10-11_14-03-22. */
export function sessionId(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

interface ObsRow {
  t: number;
  hz: number;
  midi: number;
  conf: number;
  rms: number;
  phase: string;
}

/** Observations → CSV (ms relative to the session start, 1 row per reading). */
export function observationsCsv(rows: readonly ObsRow[], t0: number): string {
  const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "");
  const lines = ["t_ms,hz,midi,confidence,rms,phase"];
  for (const r of rows) lines.push(`${f(r.t - t0, 1)},${f(r.hz, 2)},${f(r.midi, 2)},${f(r.conf, 3)},${f(r.rms, 4)},${r.phase}`);
  return lines.join("\n") + "\n";
}

/** File extension for a recorded blob's MIME type (Safari records mp4/aac). */
export function audioExt(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  return "audio";
}

const enc = (s: string) => new TextEncoder().encode(s);

export class SessionLog {
  private id: string | null = null;
  private t0 = 0;
  private phase = "idle";
  private obsRows: ObsRow[] = [];
  private events: string[] = [];
  private meta: Record<string, unknown> = {};
  /** Folder of the last write (for the UI notice). */
  lastLocation: string | null = null;

  constructor(
    private readonly persist: Persist,
    private readonly enabled: () => boolean,
  ) {}

  get active(): boolean {
    return this.id !== null;
  }

  get session(): string | null {
    return this.id;
  }

  begin(kind: string, meta: Record<string, unknown>, now: number = performance.now()): void {
    if (!this.enabled()) return;
    this.id = sessionId();
    this.t0 = now;
    this.obsRows = [];
    this.events = [];
    this.meta = {
      kind,
      startedAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      config: { audio: config.audio, note: config.note, pitch: config.pitch, recording: config.recording },
      ...meta,
    };
    this.phase = kind;
    this.event("begin", { kind }, now);
  }

  setPhase(phase: string): void {
    this.phase = phase;
  }

  obs(o: PitchObservation): void {
    if (!this.id) return;
    if (this.obsRows.length >= config.diagnostics.maxObservations) return;
    this.obsRows.push({ t: o.timestamp, hz: o.frequency, midi: o.midiNote, conf: o.confidence, rms: o.rms ?? Number.NaN, phase: this.phase });
  }

  event(name: string, data: unknown = {}, now: number = performance.now()): void {
    if (!this.id) return;
    try {
      this.events.push(JSON.stringify({ t_ms: Math.round(now - this.t0), event: name, data }));
    } catch {
      this.events.push(JSON.stringify({ t_ms: Math.round(now - this.t0), event: name }));
    }
  }

  /** Write one file now (best-effort; returns the saved path or null). */
  async write(name: string, data: string | Uint8Array): Promise<string | null> {
    if (!this.id) return null;
    try {
      const saved = await this.persist(this.id, name, typeof data === "string" ? enc(data) : data);
      if (saved) this.lastLocation = saved.replace(/\/[^/]+$/, "");
      return saved;
    } catch {
      return null;
    }
  }

  /** Flush meta + events + observations (call at every milestone). */
  async flush(extra: Record<string, unknown> = {}): Promise<void> {
    if (!this.id) return;
    this.meta = { ...this.meta, ...extra, savedAt: new Date().toISOString() };
    await this.write("meta.json", JSON.stringify(this.meta, null, 2));
    await this.write("events.jsonl", this.events.join("\n") + "\n");
    await this.write("observations.csv", observationsCsv(this.obsRows, this.t0));
  }

  async writeAudio(blob: Blob | null): Promise<void> {
    if (!this.id || !blob) return;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await this.write(`take.${audioExt(blob.type)}`, bytes);
    } catch {
      // Audio is best-effort; the rest of the log still lands.
    }
  }

  end(): void {
    this.id = null;
    this.phase = "idle";
  }
}

/** Desktop persistence: raw bytes to the Tauri `save_session_file` command. */
export function tauriPersist(): Persist | null {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  return async (session, name, data) => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("save_session_file", data, { headers: { "x-session": session, "x-name": name } });
  };
}

const PREF_KEY = "lookamusic-session-logs-v1";

/** Default ON (user request); a visible switch turns it off. */
export function loadSessionLogPref(): boolean {
  try {
    return globalThis.localStorage?.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSessionLogPref(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // Best-effort preference.
  }
}
