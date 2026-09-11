"use client";

/**
 * Developer diagnostics panel (§50). Hidden by default; toggle with `D`.
 * Reports only measured values — pipeline latency is handle time + basis,
 * labeled as such (§26: never claim zero latency).
 */
import type { PitchObservation } from "@/domain/types";
import type { SessionDiagnostics } from "@/features/audio/session";
import { centsOff, freqToNoteName } from "@/features/pitch/conversions";

export function DiagnosticsPanel({
  current,
  diagnostics,
}: {
  current: PitchObservation | null;
  diagnostics: SessionDiagnostics | null;
}) {
  const rows: [string, string][] = [
    ["Pitch", current && current.frequency > 0 ? freqToNoteName(current.frequency) : "—"],
    ["Frequency", current && current.frequency > 0 ? `${current.frequency.toFixed(2)} Hz` : "—"],
    [
      "Confidence",
      current ? `${Math.round(current.confidence * 100)}% (clarity ${Math.round(current.clarity * 100)}%)` : "—",
    ],
    [
      "Intonation",
      current && current.frequency > 0
        ? `${centsOff(current.frequency) >= 0 ? "+" : ""}${centsOff(current.frequency)} cents`
        : "—",
    ],
    ["Detected BPM", "Phase 5"],
    ["Key", "Phase 3"],
    ["Current chord", "Phase 4"],
    [
      "Handle avg / p95",
      diagnostics
        ? `${diagnostics.avgHandleMs.toFixed(2)} / ${diagnostics.p95HandleMs.toFixed(2)} ms`
        : "—",
    ],
    ["Obs rate", diagnostics ? `${diagnostics.obsRateHz.toFixed(1)} Hz` : "—"],
    ["Dropped frames", diagnostics ? String(diagnostics.droppedFrames) : "—"],
    [
      "Output latency",
      diagnostics?.outputLatencyMs != null ? `${diagnostics.outputLatencyMs.toFixed(1)} ms` : "n/a",
    ],
    ["Input RMS", diagnostics ? diagnostics.inputRms.toFixed(4) : "—"],
    ["Active instruments", "0 (Phase 6)"],
  ];
  return (
    <section className="panel" aria-label="Developer diagnostics">
      <h2>DIAGNOSTICS</h2>
      <dl className="diag">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
