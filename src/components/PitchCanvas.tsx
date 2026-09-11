"use client";

/**
 * Scrolling pitch-curve canvas (§36). Renders decimated history (midi vs time);
 * unvoiced frames break the line. Data visualization, not decoration —
 * still drawn under reduced-motion (static, no animation loop).
 */
import { useEffect, useRef } from "react";
import type { HistoryPoint } from "@/features/audio/useMicSession";

const MIN_MIDI = 40; // E2
const MAX_MIDI = 96; // C7

export function PitchCanvas({ history }: { history: HistoryPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Octave grid lines.
    ctx.strokeStyle = "#23262e";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#5d6370";
    ctx.font = "10px ui-monospace, monospace";
    for (let midi = 48; midi <= 84; midi += 12) {
      const y = yOf(midi, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(noteName(midi), 6, y - 4);
    }

    if (history.length < 2) {
      ctx.fillStyle = "#5d6370";
      ctx.font = "13px Inter, system-ui, sans-serif";
      ctx.fillText("Press Start and sing — your pitch curve appears here.", 16, h / 2);
      return;
    }

    // Time window: last N seconds of history.
    const t1 = history[history.length - 1].t;
    const t0 = history[0].t;
    const span = Math.max(1, t1 - t0);

    ctx.strokeStyle = "#e8b34b";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    for (const p of history) {
      if (p.midi < 0) {
        pen = false; // unvoiced: break the line (§2.3 — never fake continuity)
        continue;
      }
      const x = ((p.t - t0) / span) * (w - 8) + 4;
      const y = yOf(p.midi, h);
      if (!pen) {
        ctx.moveTo(x, y);
        pen = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [history]);

  return (
    <canvas
      ref={ref}
      className="melody"
      role="img"
      aria-label="Scrolling graph of detected voice pitch over time"
    />
  );
}

function yOf(midi: number, h: number): number {
  const t = (midi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI);
  return h - 12 - t * (h - 24);
}

function noteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
