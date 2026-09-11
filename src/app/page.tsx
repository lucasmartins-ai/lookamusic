"use client";

/**
 * LOOKAMUSIC — main instrument screen (§35). Phase 10 scope: polished
 * first-run (3-step onboarding), every session state with recovery,
 * audio-health advisories, help dialog, keyboard map, skip link target.
 * Renders only — step/state classification lives in `components/*.ts`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { BandPanel } from "@/components/BandPanel";
import { NoteTimeline } from "@/components/NoteTimeline";
import { PitchCanvas } from "@/components/PitchCanvas";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { AudioHealthCard, StatusCard } from "@/components/StatusCard";
import { HelpDialog } from "@/components/HelpDialog";
import {
  deriveOnboardingStep,
  readOnboardingDismissed,
  writeOnboardingDismissed,
} from "@/components/onboarding";
import { micStatusCard } from "@/components/statusCards";
import { detectAudioHealth } from "@/components/audioHealth";
import { useMicSession } from "@/features/audio/useMicSession";
import { useBand } from "@/features/instruments/useBand";
import { useMusicPipeline } from "@/features/music/useMusicPipeline";
import { useArrangement } from "@/features/music/arrangement/useArrangement";
import { ArrangementPanel } from "@/components/ArrangementPanel";
import { meterLabel } from "@/features/music/rhythm/meter";
import { freqToNoteName } from "@/features/pitch/conversions";

export default function Home() {
  const pipeline = useMusicPipeline();
  const { status, error, current, history, diagnostics, start, stop } = useMicSession(
    pipeline.pushObservation,
  );
  const [showDiag, setShowDiag] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => readOnboardingDismissed());
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const wasHelpOpen = useRef(false);
  const running = status === "running";

  // Return focus to the opener when the help dialog closes (§44).
  useEffect(() => {
    if (wasHelpOpen.current && !helpOpen) helpBtnRef.current?.focus();
    wasHelpOpen.current = helpOpen;
  }, [helpOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
      if (e.key === "d" || e.key === "D") {
        if (!typing) setShowDiag((v) => !v);
      } else if (e.key === "?") {
        if (!typing) setHelpOpen(true);
      } else if ((e.key === "s" || e.key === "S") && !typing && !e.metaKey && !e.ctrlKey) {
        if (running) void stop();
        else void start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, start, stop]);

  const voiced = current && current.frequency > 0;
  const noteName = voiced ? freqToNoteName(current.frequency) : "—";
  const confPct = current ? Math.round(current.confidence * 100) : 0;
  // Phase 5: estimated BPM always shows (resting default before evidence);
  // meter comes from the MeterTracker (rests at 4/4). No more "—" placeholders.
  const bpm = Math.round(pipeline.tempo.estimated);
  const meterText = meterLabel(pipeline.meter);
  const tempoConfident = pipeline.tempo.confidence > 0;
  const band = useBand({
    tempo: pipeline.tempo,
    meter: pipeline.meter,
    energy01: pipeline.energy01,
    density: pipeline.density,
  });
  const arrangement = useArrangement({ tempo: pipeline.tempo, meter: pipeline.meter });

  // Mic RMS → normalized energy (raw amplitude never reaches the engines).
  useEffect(() => {
    if (diagnostics) {
      const now = performance.now();
      pipeline.pushEnergy(diagnostics.inputRms, now);
      arrangement.pushEnergy(diagnostics.inputRms, now);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics]);

  // Phase 10: onboarding signals + status card + audio-health advisories.
  const everLive = running || history.length > 0;
  const step = deriveOnboardingStep({
    micLive: everLive,
    hasNote: pipeline.notes.length > 0,
    dismissed,
  });
  const showOnboarding = step !== "done" && (status === "idle" || running);
  const card = micStatusCard(status, error);
  const showCard = card !== null && (step === "done" || status !== "idle");
  const health = useMemo(() => {
    if (!running || !diagnostics) return [];
    const voicedCount = history.filter((h) => h.midi >= 0).length;
    const avgConfidence = history.length
      ? history.reduce((a, h) => a + h.confidence, 0) / history.length
      : 0;
    return detectAudioHealth({
      obsCount: history.length,
      voicedCount,
      avgConfidence,
      inputRms: diagnostics.inputRms,
      droppedFrames: diagnostics.droppedFrames,
      p95HandleMs: diagnostics.p95HandleMs,
    });
  }, [running, diagnostics, history]);

  const dismissOnboarding = () => {
    writeOnboardingDismissed();
    setDismissed(true);
  };

  return (
    <main className="stage" id="main" tabIndex={-1}>
      <header className="brand">
        <h1>
          LOOKA <span>MUSIC</span>
        </h1>
        <div className="state-readout" aria-label="Current musical state">
          <span>
            <span className={`live-dot ${running ? "on" : ""}`} aria-hidden />
            {running ? "LISTENING" : "IDLE"}
          </span>
          <span>
            KEY <strong>—</strong>
          </span>
          <span title={tempoConfident ? "Estimated tempo from your singing" : "Resting tempo — sing to set the pace"}>
            <strong>{bpm}</strong> BPM
          </span>
          <span title="Detected meter">
            <strong>{meterText}</strong>
          </span>
          <Link href="/session" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-session">
            🎙️ SESSÃO
          </Link>
          <Link href="/compose" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-compose">
            🎹 ESTÚDIO
          </Link>
          <Link href="/learn" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-learn">
            🎓 TEORIA
          </Link>
        </div>
      </header>

      {showOnboarding && (
        <OnboardingGuide
          step={step}
          onStartMic={() => void start()}
          onFinish={dismissOnboarding}
          onDismiss={dismissOnboarding}
        />
      )}

      {showCard && card && (
        <StatusCard card={card} onRetry={() => void start()} onOpenHelp={() => setHelpOpen(true)} />
      )}

      {health.map((flag) => (
        <AudioHealthCard key={flag} flag={flag} />
      ))}

      <section className="panel" aria-label="Voice melody">
        <h2>VOICE MELODY</h2>
        <div className="now-singing">
          <span className="note" aria-hidden>
            {noteName}
          </span>
          <span className="meta">
            {voiced
              ? `${current!.frequency.toFixed(1)} Hz · confidence ${confPct}%`
              : running
                ? "sing a sustained note…"
                : "press Start, then sing into your microphone"}
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {running ? `You are singing ${noteName}` : "Microphone idle"}
        </p>
        <PitchCanvas history={history} />
      </section>

      <section className="panel" aria-label="Note timeline">
        <h2>NOTE TIMELINE</h2>
        <NoteTimeline notes={pipeline.notes} phrases={pipeline.phrases} bpm={bpm} />
      </section>

      <section
        className={`panel${step === 3 ? " spotlight" : ""}`}
        aria-label="Active band"
        aria-describedby={step === 3 ? "onboarding-band-hint" : undefined}
      >
        <h2>ACTIVE BAND</h2>
        {step === 3 && (
          <p className="hint" id="onboarding-band-hint" role="note">
            Esta é a sua banda — toque num instrumento para ouvir a prévia.
          </p>
        )}
        <BandPanel
          mixer={band.mixer}
          auditioning={band.auditioning}
          lateTotal={band.lateTotal}
          onAudition={band.audition}
          onToggleMute={band.toggleMute}
          onToggleSolo={band.toggleSolo}
          onVolume={band.setVolume}
          onPan={band.setPan}
          onStop={band.stopAll}
        />
        <ArrangementPanel
          styles={arrangement.styles}
          styleId={arrangement.styleId}
          energyMode={arrangement.energyMode}
          energy01={arrangement.energy01}
          energyLevel={arrangement.energyLevel}
          arrangement={arrangement.arrangement}
          pending={arrangement.pending}
          currentBar={arrangement.currentBar}
          lastFadeSec={arrangement.lastFadeSec}
          targetDensity={arrangement.targetDensity}
          onStyle={arrangement.setStyle}
          onEnergyMode={arrangement.setEnergyMode}
          onToggleInstrument={arrangement.toggleInstrument}
        />
      </section>

      <section className="panel" aria-label="Transport">
        <h2>SESSION</h2>
        <div className="controls">
          {running ? (
            <button className="primary stop" onClick={stop} aria-label="Stop listening">
              ■ STOP
            </button>
          ) : (
            <button
              className="primary"
              onClick={start}
              disabled={status === "requesting"}
              aria-label="Start listening"
            >
              {status === "requesting" ? "REQUESTING MIC…" : "▶ START / SING"}
            </button>
          )}
          <Link
            href="/session"
            className="primary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            data-testid="cta-full-session"
            title="Abrir o Regente Completo em /session com banda em tempo real e gestos"
          >
            🎙️ REGENTE AO VIVO
          </Link>
          <button className="ghost" onClick={() => setShowDiag((v) => !v)}>
            {showDiag ? "HIDE DIAGNOSTICS" : "DIAGNOSTICS (D)"}
          </button>
          <button ref={helpBtnRef} className="ghost" onClick={() => setHelpOpen(true)} data-testid="help-open">
            AJUDA (?)
          </button>
        </div>
        <p className="hint">
          Atalhos: <kbd>S</kbd> iniciar/parar · <kbd>D</kbd> diagnósticos · <kbd>?</kbd> ajuda.
          Privacidade: microfone e câmera ficam neste dispositivo — detalhes em{" "}
          <kbd>PRIVACY.md</kbd>.
        </p>
      </section>

      <section className="panel" aria-label="Portfólio e Módulos do Sistema">
        <h2>MÓDULOS DO SISTEMA (LANÇAMENTO V1)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "8px" }}>
          <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "4px" }}>
            <h3 style={{ fontSize: "13px", margin: "0 0 4px", fontWeight: "600" }}>🎙️ Regente & Gestos</h3>
            <p className="meta" style={{ fontSize: "11px", margin: "0 0 8px", lineHeight: "1.4" }}>
              Hot drum pickup em 50ms, latência &lt; 125ms, visão on-device com 9 gestos canônicos.
            </p>
            <Link href="/session" className="primary" style={{ fontSize: "11px", padding: "4px 8px", textDecoration: "none", display: "inline-block" }}>
              Abrir Regente (/session) →
            </Link>
          </div>
          <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "4px" }}>
            <h3 style={{ fontSize: "13px", margin: "0 0 4px", fontWeight: "600" }}>🎹 Estúdio & Timeline</h3>
            <p className="meta" style={{ fontSize: "11px", margin: "0 0 8px", lineHeight: "1.4" }}>
              Gravação estruturada, quantização 1/16, regeneração harmônica e persistência IndexedDB.
            </p>
            <Link href="/compose" className="ghost" style={{ fontSize: "11px", padding: "4px 8px", textDecoration: "none", display: "inline-block" }}>
              Ver Projetos (/compose) →
            </Link>
          </div>
          <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "4px" }}>
            <h3 style={{ fontSize: "13px", margin: "0 0 4px", fontWeight: "600" }}>⬇️ Exportação Offline</h3>
            <p className="meta" style={{ fontSize: "11px", margin: "0 0 8px", lineHeight: "1.4" }}>
              Standard MIDI 1.0 (Formato 1), WAV 16-bit PCM estéreo (44.1 kHz), JSON v1 e WebM/Opus.
            </p>
            <Link href="/compose" className="ghost" style={{ fontSize: "11px", padding: "4px 8px", textDecoration: "none", display: "inline-block" }}>
              Exportar Músicas →
            </Link>
          </div>
          <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "4px" }}>
            <h3 style={{ fontSize: "13px", margin: "0 0 4px", fontWeight: "600" }}>🎓 Teoria & Pedagogia</h3>
            <p className="meta" style={{ fontSize: "11px", margin: "0 0 8px", lineHeight: "1.4" }}>
              9 níveis educacionais progressivos, cadências e funções em pt-BR (zero LLM).
            </p>
            <Link href="/learn" className="ghost" style={{ fontSize: "11px", padding: "4px 8px", textDecoration: "none", display: "inline-block" }}>
              Laboratório (/learn) →
            </Link>
          </div>
        </div>
      </section>

      {showDiag && <DiagnosticsPanel current={current} diagnostics={diagnostics} />}

      {helpOpen && <HelpDialog scope="home" onClose={() => setHelpOpen(false)} />}

      <footer className="creed">
        You don&apos;t need to know how to play an instrument to begin making music.
      </footer>
    </main>
  );
}
