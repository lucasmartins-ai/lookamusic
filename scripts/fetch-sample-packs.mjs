#!/usr/bin/env node
/**
 * Materializa os packs de som real DENTRO do app (v1.3.3 → v1.4, TDR-22).
 *
 * O usuário pediu "só sons reais, nada sintetizado". Todas as fontes abaixo
 * são GRAVAÇÕES de instrumentos acústicos, com licença que permite
 * redistribuir dentro do app:
 *
 *   - Piano    — Salamander Grand Piano V3 (Alexander Holmberg), CC-BY-3.0,
 *                2 camadas de intensidade (v6 suave / v12 forte), FLAC original
 *   - Violão   — FreePats Spanish Classical Guitar, CC0
 *   - Bateria  — Virtuosity Drums (Versilian Studios + Karoryfer), CC0.
 *                Cada batida = mix dos microfones kick + snare + overhead +
 *                sala (como o kit "completo" deles); 3 intensidades × 2
 *                variações (round-robin) por peça
 *   - Baixo    — D. Smolken Double Bass (1958 Otto Rubner), pizzicato,
 *                "Royalty-free for all commercial and non-commercial use"
 *   - Violino  — VSCO-2 Community Edition, Solo Violin Arco Vib, CC0
 *   - Cordas   — VSCO-2 Community Edition, Violin Section susVib, CC0
 *
 * Refazer:  node scripts/fetch-sample-packs.mjs   (idempotente; pula o que já existe)
 * Requer curl + ffmpeg. Saída: mp3 128 kbps mono em public/samples/<instrumento>/.
 * Os nomes locais são determinísticos — os manifests em
 * src/features/instruments/packs/*.ts montam as URLs sem consultar o upstream.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "public/samples";
const TMP = join(ROOT, ".tmp");

const NAMES_LOCAL = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
const NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const localName = (midi) => `${NAMES_LOCAL[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const sharpName = (midi) => `${NAMES_SHARP[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const PC = { c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11 };
const midiOf = (name) => {
  const m = /^([a-gA-G](?:#|b)?)(-?\d)$/.exec(name);
  return (Number(m[2]) + 1) * 12 + PC[m[1].toLowerCase()];
};

function curl(url, out) {
  execFileSync(
    "curl",
    ["-fsSL", "--retry", "4", "--retry-all-errors", "--retry-delay", "2", "--max-time", "180", "-o", out, url],
    { stdio: "inherit" },
  );
}

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
}

/**
 * Corte + fade: o pack vive em memória como PCM decodificado (~190 KB/s mono
 * a 48 kHz), então cada amostra guarda só ataque + corpo + um pedaço da cauda.
 */
function toMp3(src, dst, sec, gainDb = 0) {
  const fade = Math.min(0.4, sec / 4);
  ffmpeg([
    "-i", src, "-t", String(sec),
    "-af", `volume=${gainDb}dB,afade=t=out:st=${(sec - fade).toFixed(3)}:d=${fade}`,
    "-ac", "1", "-b:a", "128k", dst,
  ]);
}

/** Peak level in dBFS (ffmpeg volumedetect prints to stderr). */
function maxVolume(file) {
  const res = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${file}" -af volumedetect -f null - 2>&1 | grep max_volume`]).toString();
  return Number(/max_volume:\s*(-?[\d.]+)/.exec(res)[1]);
}

let made = 0;
let skipped = 0;
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

/** One remote file → one local mp3. */
function single(dir, file, url, sec, gainDb = 0) {
  const finalPath = join(ROOT, dir, file);
  if (existsSync(finalPath)) return void (skipped += 1);
  const tmp = join(TMP, `${dir}-${file}.src`);
  curl(url, tmp);
  toMp3(tmp, finalPath, sec, gainDb);
  rmSync(tmp, { force: true });
  made += 1;
  process.stdout.write(`  ${dir}/${file}\n`);
}

for (const dir of ["piano", "violao", "drums", "bass", "violin", "strings"]) mkdirSync(join(ROOT, dir), { recursive: true });
mkdirSync(TMP, { recursive: true });

// --- Piano: Salamander V3 original (FLAC), grade de 3ª menor, 2 camadas ---
const SAL = "https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/master/Samples";
console.log("Piano (Salamander V3, CC-BY-3.0)…");
for (let midi = 21; midi <= 108; midi += 3) {
  for (const layer of [6, 12]) {
    single("piano", `${localName(midi)}_v${layer}.mp3`, `${SAL}/${encodeURIComponent(`${sharpName(midi)}v${layer}.flac`)}`, 4);
  }
}

// --- Violão: FreePats Spanish Classical Guitar (inalterado) ---
const VIOLAO = [
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 45, 47, 48, 50, 52, 53, 54, 55, 56, 57, 58, 59,
  60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84,
];
const VIOLAO_BASE = "https://raw.githubusercontent.com/freepats/spanish-classical-guitar/HEAD/samples";
console.log("Violão (FreePats, CC0)…");
for (const midi of VIOLAO) {
  single("violao", `${localName(midi)}.mp3`, `${VIOLAO_BASE}/${encodeURIComponent(`${sharpName(midi)}.flac`)}`, 4);
}

// --- Baixo: D. Smolken pizzicato, camadas p / f ---
const BASS = "https://raw.githubusercontent.com/sfzinstruments/dsmolken.double-bass/master/pizz";
const BASS_NOTES = ["c1", "eb1", "g1", "bb1", "d2", "f2", "a2", "c3", "e3", "g3", "a3"];
console.log("Baixo (D. Smolken, royalty-free)…");
for (const n of BASS_NOTES) {
  for (const dyn of ["p", "f"]) single("bass", `${localName(midiOf(n))}_${dyn}.mp3`, `${BASS}/pizz_${n}_${dyn}a.wav`, 2.5);
}

// --- Violino solo: VSCO-2 CE Solo Violin Arco Vib, p / f ---
const VSCO = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings";
const VLN = ["G3", "A3", "C4", "E4", "G4", "A4", "C5", "E5", "G5", "A5", "C6", "E6", "G6", "A6", "C7"];
console.log("Violino (VSCO-2 CE, CC0)…");
for (const n of VLN) {
  for (const dyn of ["p", "f"]) single("violin", `${localName(midiOf(n))}_${dyn}.mp3`, `${VSCO}/${enc(`Solo Violin/Arco Vib/LLVln_ArcoVib_${n}_${dyn}.wav`)}`, 4);
}

// --- Cordas: VSCO-2 CE Violin Section susVib, v1 / v2 ---
const ENS = ["G2", "A2", "B2", "D3", "F#3", "A3", "C4", "E4", "G4", "B4", "D5"];
console.log("Cordas (VSCO-2 CE, CC0)…");
for (const n of ENS) {
  for (const v of [1, 2]) single("strings", `${localName(midiOf(n))}_v${v}.mp3`, `${VSCO}/${enc(`Violin Section/susVib/VlnEns_susVib_${n}_v${v}.wav`)}`, 4);
}

// --- Bateria: Virtuosity Drums, mix de 4 microfones por batida ---
const VD = "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/master";
const MICS = [["kickmic", 1], ["snaremic", 1], ["oh", 0.8], ["room", 0.6]];
/** voz do app → [articulação upstream, segundos mantidos]. */
const KIT = {
  kick: ["kick_snoff", 1.2],
  snare: ["snare_center", 1.2],
  hihat: ["hh_closed", 0.6],
  ride: ["ride_ride", 3],
  crash: ["crash_crash", 3.5],
  tom: ["htom_center", 1.5],
  rim: ["snare_crossstick", 0.8],
  clap: ["snare_rimshot", 1.2],
  shaker: ["hh_pedal", 0.6],
  cajon: ["kick_snon", 1.2],
  "cajon-slap": ["snare_muted", 0.8],
};
console.log("Bateria (Virtuosity Drums, CC0)…");
const treeFile = join(TMP, "vd-tree.json");
if (!existsSync(treeFile)) curl("https://api.github.com/repos/sfzinstruments/virtuosity_drums/git/trees/master?recursive=1", treeFile);
const tree = JSON.parse(readFileSync(treeFile, "utf8")).tree.filter((x) => x.type === "blob" && x.path.startsWith("Samples/oh/"));

/** 3 camadas (≈45%, 75%, 100% da faixa de intensidade) × 2 variações. */
function pickHits(art) {
  const re = new RegExp(`/oh_${art}_vl(\\d+)(?:_rr(\\d+))?\\.flac$`);
  const hits = tree
    .map((x) => ({ path: x.path, m: re.exec(x.path) }))
    .filter((x) => x.m)
    .map((x) => ({ path: x.path, vl: Number(x.m[1]), rr: Number(x.m[2] ?? 1) }));
  const vls = [...new Set(hits.map((h) => h.vl))].sort((a, b) => a - b);
  const at = (q) => vls[Math.round((vls.length - 1) * q)];
  const chosen = [0.45, 0.75, 1].map(at);
  return chosen.map((vl, li) => {
    const same = hits.filter((h) => h.vl === vl).sort((a, b) => a.rr - b.rr);
    if (same.length >= 2) return same.slice(0, 2);
    // Sem round-robin: a intensidade vizinha vira a 2ª variação.
    const alt = hits.find((h) => h.vl === vls[Math.max(0, vls.indexOf(vl) - 1)] && !chosen.includes(h.vl)) ?? same[0];
    void li;
    return [same[0], alt];
  });
}

for (const [voice, [art, sec]] of Object.entries(KIT)) {
  const layers = pickHits(art);
  const outs = layers.flatMap((rrs, li) => rrs.map((h, ri) => ({ h, file: `${voice}_l${li + 1}_r${ri + 1}.mp3` })));
  if (outs.every((o) => existsSync(join(ROOT, "drums", o.file)))) {
    skipped += outs.length;
    continue;
  }
  // 1) mix dos microfones (sem normalizar por arquivo: as camadas mantêm a dinâmica)
  const mixed = outs.map((o, k) => {
    const srcs = MICS.map(([mic], j) => {
      const p = o.h.path.replace("Samples/oh/", `Samples/${mic}/`).replace(/\/oh_/, `/${mic}_`);
      const local = join(TMP, `${voice}-${k}-${j}.flac`);
      curl(`${VD}/${enc(p)}`, local);
      return local;
    });
    const wav = join(TMP, `${voice}-${k}.wav`);
    const pre = MICS.map((_, j) => `[${j}]aformat=channel_layouts=mono,volume=${MICS[j][1]}[a${j}]`).join(";");
    ffmpeg([
      ...srcs.flatMap((s) => ["-i", s]),
      "-filter_complex", `${pre};${MICS.map((_, j) => `[a${j}]`).join("")}amix=inputs=${MICS.length}:normalize=0`,
      "-ac", "1", wav,
    ]);
    srcs.forEach((s) => rmSync(s, { force: true }));
    return wav;
  });
  // 2) ganho único por peça: a camada mais forte fica com pico em −1 dBFS
  const peak = Math.max(...mixed.map(maxVolume));
  outs.forEach((o, k) => {
    toMp3(mixed[k], join(ROOT, "drums", o.file), sec, -1 - peak);
    rmSync(mixed[k], { force: true });
    made += 1;
    process.stdout.write(`  drums/${o.file}\n`);
  });
}

rmSync(TMP, { recursive: true, force: true });
console.log(`\nOK — ${made} gerado(s), ${skipped} já presente(s).`);
