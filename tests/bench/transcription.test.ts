/**
 * Note-transcription benchmark against human annotations (Vocadito, CC BY 4.0:
 * 40 solo-singing excerpts, f0 + notes by annotator 1). Skipped unless
 * VOCADITO_DIR holds `wav48/vocadito_N.wav` (mono 48 kHz) and the dataset's
 * `x/Annotations/{F0,Notes}`.
 *
 *   VOCADITO_DIR=/path npx vitest run tests/bench/transcription.test.ts
 *
 * Metrics (all 0–100, higher = better):
 * - detectorRPA: raw YIN frames within 50¢ of the annotated f0 (voiced frames)
 * - noteF: note F-measure, onset ±50 ms and pitch ±50¢ (mir_eval "COnP"-like)
 * - noteTimeAcc: % of annotated note time where the app's sounding note is
 *   within 50¢ of the annotated note (what the harmony actually consumes)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { YinDetector } from "@/features/pitch/yin";
import { PitchSmoother } from "@/features/music/melody/smoothing";
import { NoteStabilizer } from "@/features/music/melody/stabilization";
import type { NoteEvent } from "@/domain/types";
import { config } from "@/lib/config";

function applyOverrides(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) applyOverrides(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    else target[k] = v;
  }
}

const DIR = process.env.VOCADITO_DIR;
const OUT = process.env.VOCADITO_OUT;

function readWav16(path: string): { sr: number; data: Float32Array } {
  const b = readFileSync(path);
  let p = 12;
  let sr = 48000;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") sr = b.readUInt32LE(p + 12);
    if (id === "data") {
      const n = Math.floor(size / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
      return { sr, data: out };
    }
    p += 8 + size + (size % 2);
  }
  throw new Error("no data");
}

const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
const csv = (path: string) =>
  readFileSync(path, "utf8").trim().split("\n").map((l) => l.split(",").map(Number));

export interface TrackResult { id: number; onsetF: number; detectorRPA: number; noteF: number; noteP: number; noteR: number; noteTimeAcc: number; refNotes: number; estNotes: number }

/** Transcribe one file with the live pipeline (YIN → smoother → stabilizer). */
export function transcribe(data: Float32Array, sr: number, hop = 2048): { notes: NoteEvent[]; frames: [number, number][] } {
  const bus = new EventBus();
  const smoother = new PitchSmoother();
  const stab = new NoteStabilizer(bus);
  const yin = new YinDetector();
  const frames: [number, number][] = [];
  const BLOCK = 2048;
  for (let i = 0; i + BLOCK <= data.length; i += hop) {
    // Timestamp = block centre (the detector sees the whole block).
    const t = (i + BLOCK / 2) / sr;
    const obs = { ...yin.process(data.subarray(i, i + BLOCK), sr), timestamp: t * 1000 };
    frames.push([t, obs.frequency > 0 ? obs.frequency : 0]);
    stab.push(smoother.push(obs));
  }
  // Flush with silence so the last note closes.
  const end = data.length / sr;
  for (let k = 1; k <= 30; k++) stab.push(smoother.push({ frequency: -1, midiNote: -1, confidence: 0, clarity: 0, timestamp: (end + k * 0.043) * 1000 }));
  return { notes: stab.completedNotes(), frames };
}

export function score(id: number, notes: NoteEvent[], frames: [number, number][], root: string): TrackResult {
  const f0 = csv(`${root}/x/Annotations/F0/vocadito_${id}_f0.csv`);
  const ref = csv(`${root}/x/Annotations/Notes/vocadito_${id}_notesA1.csv`).map(([s, hz, d]) => ({ s, m: hzToMidi(hz), d }));
  // Detector RPA: nearest annotated f0 sample to each frame.
  let voiced = 0;
  let hit = 0;
  const step = f0[1][0] - f0[0][0];
  for (const [t, hz] of frames) {
    const k = Math.round(t / step);
    const r = f0[k]?.[1] ?? 0;
    if (r <= 0) continue;
    voiced++;
    if (hz > 0 && Math.abs(hzToMidi(hz) - hzToMidi(r)) <= 0.5) hit++;
  }
  const est = notes.map((n) => ({ s: n.startTime, m: n.pitch > 0 ? hzToMidi(n.pitch) : n.midi, d: n.duration }));
  // Note F: greedy one-to-one matching.
  const used = new Set<number>();
  let tp = 0;
  for (const r of ref) {
    let best = -1;
    let bestDt = Infinity;
    est.forEach((e, j) => {
      if (used.has(j)) return;
      const dt = Math.abs(e.s - r.s);
      if (dt <= 0.05 && Math.abs(e.m - r.m) <= 0.5 && dt < bestDt) { best = j; bestDt = dt; }
    });
    if (best >= 0) { used.add(best); tp++; }
  }
  const P = est.length ? tp / est.length : 0;
  const R = ref.length ? tp / ref.length : 0;
  const F = P + R > 0 ? (2 * P * R) / (P + R) : 0;
  // Onset F (rhythm only): ±100 ms, any pitch.
  const usedO = new Set<number>();
  let tpo = 0;
  for (const r of ref) {
    const j = est.findIndex((e, k) => !usedO.has(k) && Math.abs(e.s - r.s) <= 0.1);
    if (j >= 0) { usedO.add(j); tpo++; }
  }
  const Po = est.length ? tpo / est.length : 0;
  const Ro = ref.length ? tpo / ref.length : 0;
  const Fo = Po + Ro > 0 ? (2 * Po * Ro) / (Po + Ro) : 0;
  // Note-time accuracy at 10 ms resolution over annotated note time.
  let total = 0;
  let ok = 0;
  for (const r of ref) {
    for (let t = r.s; t < r.s + r.d; t += 0.01) {
      total++;
      const e = est.find((x) => x.s <= t && t < x.s + x.d);
      if (e && Math.abs(e.m - r.m) <= 0.5) ok++;
    }
  }
  const pct = (x: number) => +(x * 100).toFixed(1);
  return { id, onsetF: pct(Fo), detectorRPA: pct(voiced ? hit / voiced : 0), noteF: pct(F), noteP: pct(P), noteR: pct(R), noteTimeAcc: pct(total ? ok / total : 0), refNotes: ref.length, estNotes: est.length };
}

describe.skipIf(!DIR)("Vocadito note transcription benchmark", () => {
  it("transcribes 40 annotated solo-singing excerpts", () => {
    if (process.env.BENCH_CFG) applyOverrides(config as unknown as Record<string, unknown>, JSON.parse(process.env.BENCH_CFG));
    const hop = Number(process.env.VOCADITO_HOP ?? config.audio.hopSize);
    const ids = readdirSync(`${DIR}/wav48`).map((f) => Number(/(\d+)/.exec(f)![1])).sort((a, b) => a - b);
    const rows: TrackResult[] = [];
    for (const id of ids) {
      const wav = `${DIR}/wav48/vocadito_${id}.wav`;
      if (!existsSync(wav)) continue;
      const { sr, data } = readWav16(wav);
      const { notes, frames } = transcribe(data, sr, hop);
      rows.push(score(id, notes, frames, DIR!));
    }
    const mean = (k: keyof TrackResult) => +(rows.reduce((s, r) => s + (r[k] as number), 0) / rows.length).toFixed(1);
    const summary = { tracks: rows.length, onsetF: mean("onsetF"), detectorRPA: mean("detectorRPA"), noteF: mean("noteF"), noteP: mean("noteP"), noteR: mean("noteR"), noteTimeAcc: mean("noteTimeAcc"), refNotes: mean("refNotes"), estNotes: mean("estNotes") };
    console.log(JSON.stringify(summary));
    if (OUT) writeFileSync(OUT, JSON.stringify({ summary, rows }));
    expect(rows.length).toBeGreaterThan(0);
  }, 300_000);
});
