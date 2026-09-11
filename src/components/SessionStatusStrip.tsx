/**
 * SessionStatusStrip — always-visible diagnostics for `/session` (Phase 17).
 * Renders only: it receives primitives and formats them. Business logic
 * (lock detection, sample/synth decision, latency) lives in the hooks.
 *
 * Answers, at a glance, the three questions the reports kept asking:
 * - Is the pitch being heard confidently? (`confidence`)
 * - Is the note locked (stable) or still hunting? (`locked`, `steadyMs`)
 * - Is the band using real samples or the procedural synth? (`sampleLabel`)
 * Plus the approximate voice→band latency.
 */
interface Props {
  running: boolean;
  pitchName: string;
  /** 0–1 current pitch confidence (raw or stable). */
  confidence: number;
  /** True once steady confident singing locked the note. */
  locked: boolean;
  /** Length of the current steady run, ms. */
  steadyMs: number;
  /** e.g. "piano: real · violão: synth · bateria: synth". */
  sampleLabel: string;
  /** Approximate perceived voice→band latency, ms. */
  latencyMs: number;
  /** Pipeline p95, ms. */
  p95Ms: number;
}

export function SessionStatusStrip({
  running,
  pitchName,
  confidence,
  locked,
  steadyMs,
  sampleLabel,
  latencyMs,
  p95Ms,
}: Props) {
  const confPct = Math.round(confidence * 100);
  return (
    <div
      className="status-strip"
      role="status"
      aria-live="polite"
      data-testid="session-status"
      style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center" }}
    >
      <span data-testid="status-pitch">
        <strong>Nota</strong> {running ? pitchName : "—"}
      </span>
      <span data-testid="status-confidence">
        <strong>Confiança</strong> {running ? `${confPct}%` : "—"}
      </span>
      <span data-testid="status-lock">
        <strong>Trava</strong>{" "}
        {running ? (locked ? `TRAVADA (${(steadyMs / 1000).toFixed(1)}s)` : "livre") : "—"}
      </span>
      <span data-testid="status-source">
        <strong>Som</strong> {sampleLabel}
      </span>
      <span data-testid="status-latency">
        <strong>Latência</strong> {latencyMs.toFixed(0)} ms (p95 {p95Ms.toFixed(1)} ms)
      </span>
    </div>
  );
}
