#!/usr/bin/env node
/**
 * Replays a real usage logged by the desktop app (TDR-25) through the same
 * a cappella benchmark used in development.
 *
 *   node scripts/analyze-session.mjs            # latest session
 *   node scripts/analyze-session.mjs <folder>   # a specific one
 *
 * Sessions live in ~/Library/Application Support/com.lookamusic.desktop/sessoes.
 * Prints: mic settings the OS applied, what the app captured (notes, tempo,
 * chords) and what the offline pipeline reconstructs from the same audio.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), "Library/Application Support/com.lookamusic.desktop/sessoes");
const dir = process.argv[2] ?? (existsSync(ROOT) ? join(ROOT, readdirSync(ROOT).sort().at(-1) ?? "") : "");
if (!dir || !existsSync(dir)) {
  console.error(`Nenhuma sessão encontrada em ${ROOT}`);
  process.exit(1);
}
const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : null);
const meta = JSON.parse(read("meta.json") ?? "{}");
console.log(`Sessão: ${dir}\nTipo: ${meta.kind}  início: ${meta.startedAt}\nMic: ${JSON.stringify(meta.mic)}`);
const events = (read("events.jsonl") ?? "").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
for (const e of events) console.log(`  ${String(e.t_ms).padStart(7)} ms  ${e.event} ${JSON.stringify(e.data ?? {}).slice(0, 160)}`);

const obs = (read("observations.csv") ?? "").trim().split("\n").slice(1).map((l) => l.split(","));
const voiced = obs.filter((r) => Number(r[1]) > 0);
const rate = obs.length > 1 ? (obs.length / ((Number(obs.at(-1)[0]) - Number(obs[0][0])) / 1000)).toFixed(1) : "0";
const rms = voiced.map((r) => Number(r[4])).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`Leituras: ${obs.length} (${rate}/s), com voz ${voiced.length} (${((voiced.length / Math.max(obs.length, 1)) * 100).toFixed(0)}%), RMS mediano da voz ${rms[Math.floor(rms.length / 2)]?.toFixed(4) ?? "-"}`);

const take = readdirSync(dir).find((f) => f.startsWith("take."));
if (!take) process.exit(0);
const tmp = mkdtempSync(join(tmpdir(), "looka-session-"));
const wav = join(tmp, "take.wav");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(dir, take), "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", wav]);
const out = join(tmp, "bench.json");
execFileSync("./node_modules/.bin/vitest", ["run", "tests/bench/acapella.test.ts"], {
  env: { ...process.env, ACAPELLA_WAV: wav, ACAPELLA_OUT: out },
  stdio: "ignore",
});
const r = JSON.parse(readFileSync(out, "utf8")).report;
console.log("Benchmark offline da MESMA tomada:");
for (const k of ["durationSec", "notes", "finalKey", "humTempo", "humBeat", "humRubPct", "humProgression", "oldTempo", "oldBeat"]) {
  console.log(`  ${k}: ${JSON.stringify(r[k])}`);
}
console.log(`(wav convertido em ${wav})`);
