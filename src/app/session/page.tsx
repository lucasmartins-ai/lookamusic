"use client";

/**
 * `/session` — full conductor experience (Phase 8, §32).
 * Voice → conductor → band on one transport: live key/BPM/meter/chords,
 * quantized add/remove, energy, latency + degradation badge, diagnostics.
 * `?fixture=g4` (or the "Sing fixture" button) injects a synthetic G4
 * phrase — the no-mic path Playwright uses in CI.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMicSession } from "@/features/audio/useMicSession";
import { useConductor } from "@/features/conductor/useConductor";
import { useRecorder } from "@/features/recording/useRecorder";
import { useGestures } from "@/features/gestures/useGestures";
import { GesturePanel } from "@/components/GesturePanel";
import { AudioHealthCard, StatusCard } from "@/components/StatusCard";
import { HelpDialog } from "@/components/HelpDialog";
import { micStatusCard } from "@/components/statusCards";
import { detectAudioHealth } from "@/components/audioHealth";
import { g4Observations } from "@/features/conductor/fixture";
import { freqToNoteName } from "@/features/pitch/conversions";
import { INSTRUMENTS, type InstrumentId } from "@/domain/types";
import { useLearnSettings } from "@/features/learn/useLearnSettings";
import { LearnPanel } from "@/components/LearnPanel";
import { VocalPitchCoach } from "@/features/pitch/coach";
import { VocalCoachPanel } from "@/components/VocalCoachPanel";
import { AutotunePanel } from "@/components/AutotunePanel";
import { Suspense } from "react";

const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function keyLabel(root: number, mode: string): string {
  return `${KEY_NAMES[((Math.round(root) % 12) + 12) % 12] ?? "?"} ${mode}`;
}

function SessionBody() {
  const cond = useConductor();
  const mic = useMicSession(cond.pushObservation);
  const recorder = useRecorder();
  const gestures = useGestures();
  const learn = useLearnSettings();
  const coach = useMemo(() => new VocalPitchCoach(), []);
  const params = useSearchParams();
  const [showDiag, setShowDiag] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const wasHelpOpen = useRef(false);
  const running = mic.status === "running";

  // Return focus to the opener when the help dialog closes (§44).
  useEffect(() => {
    if (wasHelpOpen.current && !helpOpen) helpBtnRef.current?.focus();
    wasHelpOpen.current = helpOpen;
  }, [helpOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") setShowDiag((v) => !v);
      else if (e.key === "?") setHelpOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mic RMS → conductor dynamics (raw amplitude never reaches the engines).
  useEffect(() => {
    if (mic.diagnostics) cond.pushEnergy(mic.diagnostics.inputRms, performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.diagnostics]);

  useEffect(() => {
    mic.setKey(cond.key);
  }, [cond.key, mic]);

  const singFixture = () => {
    const now = Date.now();
    cond.injectFixture(g4Observations(now, now + 2400), 0.2);
  };

  useEffect(() => {
    if (params.get("fixture") === "g4") {
      const t = setTimeout(singFixture, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const voiced = mic.current && mic.current.frequency > 0;
  const noteName = useMemo(
    () => (voiced ? freqToNoteName(mic.current!.frequency) : "—"),
    [voiced, mic.current],
  );
  const chordLabel = cond.chords.length > 0
    ? cond.chords[cond.chords.length - 1].chord
    : null;

  // Phase 10: every mic state gets a recovery card; advisories while live.
  const card = micStatusCard(mic.status, mic.error);
  const health = useMemo(() => {
    if (!running || !mic.diagnostics) return [];
    const voicedCount = mic.history.filter((h) => h.midi >= 0).length;
    const avgConfidence = mic.history.length
      ? mic.history.reduce((a, h) => a + h.confidence, 0) / mic.history.length
      : 0;
    return detectAudioHealth({
      obsCount: mic.history.length,
      voicedCount,
      avgConfidence,
      inputRms: mic.diagnostics.inputRms,
      droppedFrames: mic.diagnostics.droppedFrames,
      p95HandleMs: mic.diagnostics.p95HandleMs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mic.diagnostics, mic.history]);

  const startSession = () => {
    cond.ensureAudio();
    void mic.start();
  };

  return (
    <main className="stage" id="main" tabIndex={-1}>
      <header className="brand">
        <h1>
          LOOKA <span>SESSION</span>
        </h1>
        <div className="state-readout" aria-label="Current musical state">
          <span>
            <span className={`live-dot ${running ? "on" : ""}`} aria-hidden />
            {running ? "LISTENING" : "IDLE"}
          </span>
          <span>
            KEY <strong data-testid="key">{keyLabel(cond.key.root, cond.key.mode)}</strong>
          </span>
          <span>
            <strong data-testid="bpm">{Math.round(cond.tempo.playback)}</strong> BPM
          </span>
          <span>
            <strong data-testid="meter">{cond.meterText}</strong>
          </span>
          <span>
            CHORD <strong data-testid="chord">{chordLabel ? `${KEY_NAMES[chordLabel.root]} ${chordLabel.quality}` : "—"}</strong>
          </span>
          <button
            className="ghost"
            onClick={learn.toggleEnabled}
            data-testid="toggle-learn"
            title="Ativar/Desativar modo educacional"
            style={{ fontSize: "11px", padding: "2px 8px" }}
          >
            🎓 EDU {learn.enabled ? "ON" : "OFF"}
          </button>
          <Link href="/learn" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-learn">
            📚 APRENDER
          </Link>
          <Link href="/compose" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-compose">
            📂 PROJETOS
          </Link>
        </div>
      </header>

      {cond.badge && (
        <div className="notice" role="status" data-testid="degradation-badge">
          <strong>{cond.badge}</strong>
        </div>
      )}

      {card && (
        <StatusCard card={card} onRetry={startSession} onOpenHelp={() => setHelpOpen(true)} />
      )}

      {health.map((flag) => (
        <AudioHealthCard key={flag} flag={flag} />
      ))}

      <section className="panel" aria-label="Conductor transport">
        <h2>CONDUCTOR</h2>
        <p data-testid="transport">
          Bar {cond.currentBar.toFixed(2)} · {cond.noteCount} notes · {cond.dispatchedTotal} scheduled · {cond.lateTotal} late
        </p>
        <p data-testid="latency">
          Voice→band p95 {cond.latencyP95.toFixed(1)} ms · perceived {cond.perceivedMs.toFixed(0)} ms{" "}
          {cond.withinBudget ? "(within 250 ms)" : "(OVER BUDGET)"}
        </p>
        <div className="controls">
          {running ? (
            <button className="primary stop" onClick={mic.stop} aria-label="Stop listening" data-testid="stop">
              ■ STOP
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => { cond.ensureAudio(); void mic.start(); }}
              disabled={mic.status === "requesting"}
              aria-label="Start session"
              data-testid="start"
            >
              {mic.status === "requesting" ? "REQUESTING MIC…" : "▶ START SESSION"}
            </button>
          )}
          <button onClick={singFixture} aria-label="Sing synthetic fixture" data-testid="fixture">
            ♪ SING FIXTURE (no mic)
          </button>
          <button className="ghost" onClick={() => setShowDiag((v) => !v)}>
            {showDiag ? "HIDE DIAGNOSTICS" : "DIAGNOSTICS (D)"}
          </button>
          <button ref={helpBtnRef} className="ghost" onClick={() => setHelpOpen(true)} data-testid="help-open">
            AJUDA (?)
          </button>
        </div>
        <p className="hint">
          Sem microfone? Use SING FIXTURE. Microfone e câmera ficam neste dispositivo
          (ver <kbd>PRIVACY.md</kbd>). Atalhos: <kbd>D</kbd> diagnósticos · <kbd>?</kbd> ajuda.
        </p>
        <p className="meta" aria-live="polite" data-testid="now-singing">
          {voiced ? `Singing ${noteName}` : "Press START + sing, or SING FIXTURE with no mic"}
        </p>
      </section>

      <VocalCoachPanel
        observation={mic.current}
        keyEstimate={cond.key}
        coach={coach}
        onResetStats={() => coach.resetStats()}
      />

      <AutotunePanel
        config={mic.autotune}
        onChange={mic.updateAutotune}
        keyLabel={keyLabel(cond.key.root, cond.key.mode)}
      />

      {learn.enabled && (
        <LearnPanel
          musicalState={cond.getMusicalState()}
          level={learn.level}
          onSelectLevel={learn.setLevel}
          onClose={learn.toggleEnabled}
          locale={learn.locale}
          onSelectLocale={learn.setLocale}
          screenReaderAnnounce={learn.screenReaderAnnounce}
          onToggleScreenReader={learn.toggleScreenReaderAnnounce}
        />
      )}

      <section className="panel" aria-label="Gravação e Composição">
        <h2>GRAVAÇÃO E COMPOSIÇÃO</h2>
        <div className="controls">
          {recorder.isRecording ? (
            <button
              className="primary stop"
              onClick={async () => {
                await recorder.stopRecording();
              }}
              data-testid="btn-stop-recording"
            >
              ■ PARAR GRAVAÇÃO
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => recorder.startRecording()}
              data-testid="btn-start-recording"
            >
              ● GRAVAR SESSÃO
            </button>
          )}

          {recorder.lastComposition && (
            <Link
              href={`/compose/${recorder.lastComposition.id}`}
              className="primary"
              data-testid="link-open-editor"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              ✏ ABRIR NO EDITOR
            </Link>
          )}

          <Link
            href="/compose"
            className="ghost"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            data-testid="link-compose-hub"
          >
            📂 PROJETOS SALVOS ({recorder.compositions.length})
          </Link>
        </div>
        <p className="hint">
          {recorder.isRecording
            ? "Gravando notas, acordes e arranjo em representação estruturada…"
            : recorder.lastComposition
            ? `Última sessão salva: "${recorder.lastComposition.name}" (${recorder.lastComposition.melody.length} notas). Clique em ABRIR NO EDITOR para editar a timeline.`
            : "Grave uma sessão estruturada (voz + banda) para editar e salvar localmente no IndexedDB."}
        </p>
      </section>

      <section className="panel" aria-label="Band lineup">
        <h2>BAND</h2>
        <div className="controls" role="group" aria-label="Instruments">
          {(INSTRUMENTS as readonly InstrumentId[]).map((id) => {
            const on = cond.active[id];
            const pend = cond.pendingFull.find((p) => p.instrument === id);
            return (
              <button
                key={id}
                data-testid={`band-${id}`}
                data-active={on ? "true" : "false"}
                onClick={() => cond.toggleInstrument(id)}
                aria-pressed={on}
                title={pend ? `Queued → bar ${pend.effectiveBar}` : on ? "On (click to remove, quantized)" : "Off (click to add, quantized)"}
              >
                {on ? "■" : "＋"} {id}{pend ? " ⏳" : ""}
              </button>
            );
          })}
        </div>
        <p className="meta" data-testid="lineup">
          Lineup: {(INSTRUMENTS as readonly InstrumentId[]).filter((id) => cond.active[id]).join(", ") || "none"}
        </p>
      </section>

      <section className="panel" aria-label="Gesture conducting">
        <h2>GESTURES</h2>
        <GesturePanel
          gestures={gestures}
          selected={cond.gestureSelected}
          onSelect={cond.setGestureSelected}
        />
      </section>

      <section className="panel" aria-label="Style and energy">
        <h2>STYLE + ENERGY</h2>
        <div className="controls">
          <label>
            Style{" "}
            <select
              data-testid="style"
              value={cond.styleId}
              onChange={(e) => cond.setStyle(e.target.value)}
            >
              {cond.styles.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Energy{" "}
            <select
              data-testid="energy-mode"
              onChange={(e) => cond.setEnergyMode(e.target.value as "auto" | "low" | "medium" | "high")}
              defaultValue="auto"
            >
              <option value="auto">Auto (voice)</option>
              <option value="low">Suave</option>
              <option value="medium">Média</option>
              <option value="high">Cheia</option>
            </select>
          </label>
        </div>
        <p className="meta" data-testid="energy">
          Energy {cond.energy01.toFixed(2)} ({cond.energyLevel}) · density {cond.density.toFixed(2)}
        </p>
      </section>

      {showDiag && (
        <section className="panel" aria-label="Developer diagnostics" data-testid="diagnostics">
          <h2>DIAGNOSTICS</h2>
          <dl className="diag">
            <div><dt>Handle p95</dt><dd>{cond.latencyP95.toFixed(2)} ms</dd></div>
            <div><dt>Perceived</dt><dd>{cond.perceivedMs.toFixed(0)} ms (budget 250)</dd></div>
            <div><dt>Scheduler</dt><dd>{cond.dispatchedTotal} dispatched · {cond.lateTotal} late</dd></div>
            <div><dt>Degradation</dt><dd>{cond.degradation.level}{cond.badge ? ` — ${cond.badge}` : ""}</dd></div>
            <div><dt>Obs rate</dt><dd>{mic.diagnostics ? `${mic.diagnostics.obsRateHz.toFixed(1)} Hz` : "—"}</dd></div>
            <div><dt>Handle avg/p95 (mic)</dt><dd>{mic.diagnostics ? `${mic.diagnostics.avgHandleMs.toFixed(2)} / ${mic.diagnostics.p95HandleMs.toFixed(2)} ms` : "—"}</dd></div>
            <div><dt>Chords</dt><dd data-testid="chord-count">{cond.chords.length}</dd></div>
          </dl>
        </section>
      )}

      {helpOpen && <HelpDialog scope="session" onClose={() => setHelpOpen(false)} />}

      <footer className="creed">
        You sing the song. LookaMusic builds the band.
      </footer>
    </main>
  );
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionBody />
    </Suspense>
  );
}
