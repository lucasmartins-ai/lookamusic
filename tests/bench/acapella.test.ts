/**
 * A cappella benchmark (real recordings, not fixtures). Skipped unless
 * ACAPELLA_WAV points at a mono float/16-bit WAV. Replays the exact mic path:
 * 2048-sample blocks → YIN → Conductor.pushObservation/pushEnergy, transport
 * tick every 50 ms, and records what the band WOULD play (fake engines).
 *
 *   ACAPELLA_WAV=voice.wav ACAPELLA_OUT=out.json npx vitest run tests/bench
 *
 * Metrics (duration-weighted over the stabilized sung notes):
 * - chordTone: note is a tone of the chord sounding under it (consonance)
 * - clash: note is neither a chord tone nor in the current key's scale
 * - chordChangesPerMin, keyChanges: stability
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { YinDetector } from "@/features/pitch/yin";
import { rms } from "@/features/pitch/detector";
import { chordTones, chordName } from "@/features/music/theory/chords";
import { scaleContains } from "@/features/music/theory/scales";
import type { Chord, InstrumentId, KeyEstimate } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { beatToAudioTime } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";
import { buildPlayAlongComposition } from "@/features/recording/playalong";
import { barQuarters } from "@/features/music/rhythm/meter";
import { INSTRUMENTS } from "@/domain/types";
import { styleDrums } from "@/features/music/arrangement/presets";
import * as planning from "@/features/instruments/planning";

const WAV = process.env.ACAPELLA_WAV;
const OUT = process.env.ACAPELLA_OUT;
const IDS: InstrumentId[] = ["drums", "bass", "piano", "guitar", "violao", "strings", "violin", "sax", "accordion"];

function readWav(path: string): { sr: number; data: Float32Array } {
  const b = readFileSync(path);
  let p = 12;
  let sr = 48000;
  let bits = 16;
  let ch = 1;
  let fmt = 1;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      fmt = b.readUInt16LE(p + 8);
      ch = b.readUInt16LE(p + 10);
      sr = b.readUInt32LE(p + 12);
      bits = b.readUInt16LE(p + 22);
    } else if (id === "data") {
      const n = Math.floor(size / (bits / 8) / ch);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = p + 8 + i * ch * (bits / 8);
        out[i] = fmt === 3 ? b.readFloatLE(o) : b.readInt16LE(o) / 32768;
      }
      return { sr, data: out };
    }
    p += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

interface Played { instrument: InstrumentId; at: number; midi: number; dur: number; vel: number }

import { config } from "@/lib/config";

/** BENCH_CFG='{"harmony":{"holdBonus":0.3}}' deep-merges into config (sweeps). */
function applyOverrides(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) applyOverrides(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    else target[k] = v;
  }
}

describe.skipIf(!WAV)("a cappella benchmark", () => {
  it("runs the recording through the live conductor", () => {
    if (process.env.BENCH_CFG) applyOverrides(config as unknown as Record<string, unknown>, JSON.parse(process.env.BENCH_CFG));
    const { sr, data } = readWav(WAV!);
    const events = new EventBus();
    const played: Played[] = [];
    const band = {} as Record<InstrumentId, InstrumentEngine>;
    for (const id of IDS) {
      band[id] = {
        id,
        schedule(evts: MusicalEvent[], ctx: ScheduleContext) {
          for (const e of evts) {
            played.push({
              instrument: e.instrument,
              at: beatToAudioTime(ctx.audioTime, e.beat, ctx.tempo.playback),
              midi: e.note.midi,
              dur: e.note.duration,
              vel: e.note.velocity,
            });
          }
        },
        stop() {},
        setVolume() {},
        setPan() {},
      };
    }
    let now = 0;
    // Same starting lineup as the app (useConductor INITIAL_ACTIVE: core trio).
    const trio = Object.fromEntries(IDS.map((id) => [id, (config.arrangement.coreEnsemble as readonly string[]).includes(id)])) as Record<InstrumentId, boolean>;
    const c = new Conductor(createEngines(events, trio), { band, schedulerNow: () => now, seed: "acapella" }, events);
    c.reset(0);
    const chords: { bar: number; start: number; chord: Chord }[] = [];
    const keys: { t: number; key: KeyEstimate }[] = [];
    events.on("ChordChanged", (e) => chords.push({ bar: e.startBar, start: c.transport.barStartSec(e.startBar), chord: e.chord }));
    events.on("KeyUpdated", (k) => keys.push({ t: now, key: k }));

    const yin = new YinDetector();
    const BLOCK = 2048;
    let nextTick = 0;
    const raw: [number, number][] = [];
    for (let i = 0; i + BLOCK <= data.length; i += config.audio.hopSize) {
      const buf = data.subarray(i, i + BLOCK);
      now = (i + BLOCK) / sr;
      const obs = { ...yin.process(buf, sr), timestamp: now * 1000 };
      if (obs.confidence > 0.8 && obs.midiNote > 0) raw.push([+now.toFixed(3), +obs.midiNote.toFixed(3)]);
      c.pushObservation(obs);
      c.pushEnergy(rms(buf), now * 1000);
      while (nextTick <= now) {
        c.tick(nextTick);
        nextTick += 0.05;
      }
    }
    const end = data.length / sr;
    for (; nextTick <= end + 0.5; nextTick += 0.05) {
      now = nextTick;
      c.tick(nextTick);
    }

    const notes = c.state.melodyNotes().filter((n) => n.duration > 0);
    const key = c.state.currentKey();
    // Chord sounding at time t = last chord whose bar started at/before t.
    const chordAt = (t: number) => {
      let cur: Chord | undefined;
      for (const ch of chords) if (ch.start <= t + 1e-6) cur = ch.chord;
      return cur;
    };
    const keyAt = (t: number) => {
      let cur: KeyEstimate = key;
      for (const k of keys) if (k.t <= t) cur = k.key;
      return cur;
    };
    let total = 0;
    let tone = 0;
    let clash = 0;
    for (const n of notes) {
      const mid = n.startTime + n.duration / 2;
      const ch = chordAt(mid);
      if (!ch) continue;
      const pc = ((Math.round(n.midi) % 12) + 12) % 12;
      const k = keyAt(mid);
      total += n.duration;
      if (chordTones(ch).includes(pc as never)) tone += n.duration;
      else if (!scaleContains(k.root, k.mode === "minor" ? "natural-minor" : "major", pc)) clash += n.duration;
    }
    let changes = 0;
    for (let i = 1; i < chords.length; i++) {
      if (chordName(chords[i].chord) !== chordName(chords[i - 1].chord)) changes++;
    }
    let keyChanges = 0;
    for (let i = 1; i < keys.length; i++) {
      if (keys[i].key.root !== keys[i - 1].key.root || keys[i].key.mode !== keys[i - 1].key.mode) keyChanges++;
    }
    // Perceptual check on RAW pitch: % of voiced frames where the voice rubs
    // a semitone (ic 0.5–1.5 st) against a pitched band note sounding then.
    const pitched = played.filter((p) => p.instrument !== "drums").sort((a, b) => a.at - b.at);
    let framesWithBand = 0;
    let rub = 0;
    for (const [t, m] of raw) {
      const sounding = pitched.filter((p) => p.at <= t && t < p.at + p.dur);
      if (sounding.length === 0) continue;
      framesWithBand++;
      const hit = sounding.some((p) => {
        const d = Math.abs(((((m - p.midi) % 12) + 12) % 12));
        const ic = Math.min(d, 12 - d);
        return ic >= 0.5 && ic < 1.5;
      });
      if (hit) rub++;
    }
    // Hum-first: the composition the band loops after the take. Raw frames
    // are mapped onto composition time via the shift of a kept note id.
    let humRubPct: number | null = null;
    const humPlayed: Played[] = [];
    let humShift = 0;
    let humProgression = "";
    const comp = buildPlayAlongComposition(c.state.snapshot());
    if (comp && comp.melody.length > 0) {
      const src = c.state.melodyNotes().find((n) => n.id === comp.melody[0].id);
      const shift = src ? src.startTime - comp.melody[0].startTime : 0;
      const barSec = (barQuarters(comp.timeSignature) * 60) / comp.tempo;
      const chordAtBar = (b: number) => comp.chords.find((x) => b >= x.startBar && b < x.startBar + x.durationBars)?.chord ?? comp.chords[comp.chords.length - 1].chord;
      let n = 0;
      let r = 0;
      for (const [t, m] of raw) {
        const tc = t - shift;
        if (tc < 0) continue;
        const pcs = chordTones(chordAtBar(Math.floor(tc / barSec)));
        n++;
        if (pcs.some((p) => { const d = ((((m - p) % 12) + 12) % 12); const ic = Math.min(d, 12 - d); return ic >= 0.7 && ic <= 1.3; })) r++;
      }
      humRubPct = +((r / Math.max(n, 1)) * 100).toFixed(1);
      // Mirror CompositionPlayer.play (one loop, original-recording timeline).
      humShift = shift;
      const PLAN: Record<string, (i: planning.PassageInput, b: number) => MusicalEvent[]> = {
        drums: planning.planDrums, bass: planning.planBass, piano: planning.planPiano, guitar: planning.planGuitar,
        violao: planning.planViolao, strings: planning.planStrings, violin: planning.planViolin, sax: planning.planSax, accordion: planning.planAccordion,
      };
      const totalBars = Math.ceil(Math.max(...comp.melody.map((x) => x.startTime + x.duration)) / barSec);
      for (let bar = 0; bar < totalBars; bar++) {
        const input: planning.PassageInput = {
          chords: [chordAtBar(bar)], melody: [], phraseStarts: [0], meter: comp.timeSignature, bpm: comp.tempo,
          originSec: 0, energy01: 0.6, density: 0.5, style: styleDrums("neutral"), barIndex: bar,
        };
        for (const id of INSTRUMENTS) {
          const ch = comp.instruments[id];
          if (ch && ch.muted) continue;
          if (comp.arrangement?.active && comp.arrangement.active[id] !== true) continue;
          for (const e of PLAN[id](input, 1)) {
            humPlayed.push({ instrument: id, at: shift + bar * barSec + (e.beat * 60) / comp.tempo, midi: e.note.midi, dur: e.note.duration, vel: e.note.velocity });
          }
        }
      }
      for (const m of comp.melody) humPlayed.push({ instrument: "piano", at: shift + m.startTime, midi: m.midi, dur: m.duration, vel: 0.45 });
      humProgression = comp.chords.map((x) => `${chordName(x.chord)}x${x.durationBars}`).join(" ");
    }
    // Rhythm: |sung onset − nearest band beat| for the hum-first grid, vs the
    // pre-TDR-23 grid (live playback tempo, first note at 0.5 s).
    const beatErr = (bpm: number, origin: number) => {
      const p = 60 / bpm;
      const errs = notes.map((n) => {
        const x = (n.startTime - origin) / p;
        return Math.abs(x - Math.round(x)) * p * 1000;
      }).sort((a, b) => a - b);
      return { medianMs: Math.round(errs[Math.floor(errs.length / 2)] ?? 0), within70: +((errs.filter((e) => e <= 70).length / Math.max(errs.length, 1)) * 100).toFixed(0) };
    };
    const firstNote = Math.min(...notes.map((n) => n.startTime));
    const oldBpm = Math.round(c.state.snapshot().tempo.playback);
    const humBeat = comp ? beatErr(comp.tempo, humShift) : null;
    const oldBeat = beatErr(oldBpm, firstNote - 0.5);
    const report = {
      humTempo: comp?.tempo,
      humBeat,
      oldTempo: oldBpm,
      oldBeat,
      humRubPct,
      humProgression,
      semitoneRubPct: +((rub / Math.max(framesWithBand, 1)) * 100).toFixed(1),
      bandCoveragePct: +((framesWithBand / Math.max(raw.length, 1)) * 100).toFixed(1),
      file: WAV,
      durationSec: +end.toFixed(1),
      notes: notes.length,
      finalKey: `${key.root}:${key.mode}`,
      keyChanges,
      bars: chords.length,
      chordChanges: changes,
      chordChangesPerMin: +((changes / end) * 60).toFixed(1),
      chordTonePct: +((tone / Math.max(total, 1e-9)) * 100).toFixed(1),
      clashPct: +((clash / Math.max(total, 1e-9)) * 100).toFixed(1),
      tempoBpm: +c.state.snapshot().tempo.playback.toFixed(1),
      lateTotal: c.schedulerStats().lateTotal,
      progression: chords.map((x) => chordName(x.chord)).join(" "),
    };
    console.log(JSON.stringify(report, null, 1));
    if (OUT) {
      writeFileSync(OUT, JSON.stringify({ report, played, notes, chords, raw, humPlayed, humShift }, null, 0));
    }
    c.dispose();
    expect(notes.length).toBeGreaterThan(0);
  }, 120_000);
});
