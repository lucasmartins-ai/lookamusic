#!/usr/bin/env node
/**
 * Materializa os packs de som real DENTRO do app (v1.3.3).
 *
 * Antes os packs eram remotos e o usuário tinha que clicar em "baixar" — o que
 * falhava (CORS/cache/webview) e obrigava uma ação que não deveria existir. O
 * usuário pediu "que venha já instalado": agora os áudios ficam no bundle
 * (`public/samples/**`, servidos na mesma origem do app web/PWA e do
 * instalador Tauri) e carregam sozinhos, sem download e sem gesto.
 *
 * Este script documenta a proveniência e permite refazer os arquivos:
 *   node scripts/fetch-sample-packs.mjs
 *
 * Licenças (mantidas nos manifests + tela de créditos):
 *   - Piano  — Salamander Grand Piano (Alexander Holmberg), CC-BY-3.0
 *   - Violão — FreePats Spanish Classical Guitar, CC0
 *   - Bateria— FreePats Synthesizer Percussion, CC0
 * FLAC de origem é transcodificado para mp3 (mesmo áudio, formato que
 * `decodeAudioData` lê em todos os alvos: Chrome, Edge, Safari/WKWebView,
 * Firefox).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "public/samples";
const TMP = join(ROOT, ".tmp");

const NAMES_MP3 = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
const nameOf = (midi) => `${NAMES_MP3[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/**
 * Nome local com `s` p/ sustenidos (URL nunca leva `#`), mas o upstream do
 * violão batiza os arquivos com `#` — a URL precisa da forma original.
 */
const NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const upstreamNameOf = (midi) =>
  `${NAMES_SHARP[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/** Piano: Salamander, grade de 3ª menor 21…108 (mesma do manifest). */
const PIANO = [];
for (let midi = 21; midi <= 108; midi += 3) PIANO.push(midi);

/** Violão: exatamente as notas gravadas upstream (G1…C6). */
const VIOLAO = [
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 45, 47, 48, 50, 52, 53, 54, 55, 56, 57, 58, 59,
  60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84,
];

/** Bateria: só as vozes que o upstream realmente gravou. */
const DRUMS = [
  ["kick", "Kick04"],
  ["snare", "Snare09"],
  ["hihat", "ClosedHiHat01-01"],
  ["ride", "Cymbal02"],
  ["crash", "Cymbal01-01"],
  ["tom", "MidTom02-01"],
  ["rim", "Claves01"],
  ["clap", "Clap01"],
  ["shaker", "Shaker04"],
];

const PIANO_BASE = "https://tonejs.github.io/audio/salamander";
const VIOLAO_BASE = "https://raw.githubusercontent.com/freepats/spanish-classical-guitar/HEAD/samples";
const DRUMS_BASE = "https://raw.githubusercontent.com/freepats/synthesizer-percussion/HEAD/samples";

function curl(url, out) {
  execFileSync(
    "curl",
    ["-fsSL", "--retry", "4", "--retry-all-errors", "--retry-delay", "2", "--max-time", "90", "-o", out, url],
    { stdio: "inherit" },
  );
}

/**
 * FLAC → mp3 128 kbps mono (reprodução em todos os webviews alvo).
 *
 * O corte em `SAMPLE_SEC` + fade é deliberado: um pack pré-carregado vive
 * como AudioBuffer decodificado em memória, e PCM custa sampleRate × canais ×
 * 4 bytes por segundo (~350 KB/s mono). A cauda original do piano tem 16 s
 * (~5,6 MB de RAM por nota, ×30 notas ≈ 170 MB); 4 s cobrem ataque + corpo e o
 * envelope/`stop()` do player já corta antes do fim.
 */
const SAMPLE_SEC = 4;

function toMp3(src, dst, mono = true) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", src,
    "-t", String(SAMPLE_SEC),
    "-af", `afade=t=out:st=${SAMPLE_SEC - 0.4}:d=0.4`,
    "-ac", mono ? "1" : "2", "-b:a", "128k", dst,
  ]);
}

let downloaded = 0;
let skipped = 0;

function job(dir, file, url, transcode) {
  const finalPath = join(ROOT, dir, file);
  if (existsSync(finalPath)) {
    skipped += 1;
    return;
  }
  const tmpPath = join(TMP, `${dir}-${file}`);
  curl(url, tmpPath);
  if (transcode) toMp3(tmpPath, finalPath, transcode === "mono");
  else writeFileSync(finalPath, execFileSync("cat", [tmpPath]));
  rmSync(tmpPath, { force: true });
  downloaded += 1;
  process.stdout.write(`  ${dir}/${file}\n`);
}

for (const dir of ["piano", "violao", "drums"]) mkdirSync(join(ROOT, dir), { recursive: true });
mkdirSync(TMP, { recursive: true });

console.log("Baixando piano (Salamander, CC-BY-3.0)…");
for (const midi of PIANO) {
  // Mono também no piano: metade do bundle e metade da RAM decodificada
  // (~47 MB para os 87 samples em vez de ~89 MB). O mixer já posiciona cada
  // voz no estéreo.
  job("piano", `${nameOf(midi)}.mp3`, `${PIANO_BASE}/${nameOf(midi)}.mp3`, "mono");
}

console.log("Baixando violão (FreePats, CC0)…");
for (const midi of VIOLAO) {
  const upstream = encodeURIComponent(`${upstreamNameOf(midi)}.flac`);
  job("violao", `${nameOf(midi)}.mp3`, `${VIOLAO_BASE}/${upstream}`, true);
}

console.log("Baixando bateria (FreePats, CC0)…");
for (const [voice, upstream] of DRUMS) {
  job("drums", `${voice}.mp3`, `${DRUMS_BASE}/${upstream}.flac`, true);
}

rmSync(TMP, { recursive: true, force: true });
console.log(`\nOK — ${downloaded} baixado(s), ${skipped} já presente(s).`);
