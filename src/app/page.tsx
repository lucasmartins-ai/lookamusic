"use client";

/**
 * LOOKAMUSIC — main instrument screen (§35).
 * Real-time voice-to-band conductor: sing into microphone, live band plays immediately.
 * Neumorphic retro radio hi-fi design, analog VU meter, radio dial pitch tuner, SVG icons.
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
import { RetroVuMeter } from "@/components/RetroVuMeter";
import { RetroTunerScale } from "@/components/RetroTunerScale";
import {
  deriveOnboardingStep,
  readOnboardingDismissed,
  writeOnboardingDismissed,
} from "@/components/onboarding";
import { micStatusCard } from "@/components/statusCards";
import { detectAudioHealth } from "@/components/audioHealth";
import { useMicSession } from "@/features/audio/useMicSession";
import { useConductor } from "@/features/conductor/useConductor";
import { ArrangementPanel } from "@/components/ArrangementPanel";
import { freqToNoteName } from "@/features/pitch/conversions";
import type { TimelineNote, TimelinePhrase } from "@/features/music/useMusicPipeline";
import {
  MicIcon,
  PianoIcon,
  GraduationIcon,
  FolderIcon,
  PlayIcon,
  StopIcon,
  RadioIcon,
  DiagnosticsIcon,
  HelpIcon,
  DownloadIcon,
  ChevronRightIcon,
} from "@/components/icons";

const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function keyLabel(root: number, mode: string): string {
  return `${KEY_NAMES[((Math.round(root) % 12) + 12) % 12] ?? "?"} ${mode}`;
}

export default function Home() {
  const cond = useConductor();
  const { status, error, current, history, diagnostics, start: startMic, stop: stopMic } = useMicSession(
    cond.pushObservation,
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

  const start = () => {
    cond.ensureAudio();
    void startMic();
  };

  const stop = () => {
    void stopMic();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
      if (e.key === "d" || e.key === "D") {
        if (!typing) setShowDiag((v) => !v);
      } else if (e.key === "?") {
        if (!typing) setHelpOpen(true);
      } else if ((e.key === "s" || e.key === "S") && !typing && !e.metaKey && !e.ctrlKey) {
        if (running) stop();
        else start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  const voiced = Boolean(current && current.frequency > 0);
  const noteName = voiced && current ? freqToNoteName(current.frequency) : "—";
  const bpm = Math.round(cond.tempo.playback);
  const meterText = cond.meterText;
  const chordLabel = cond.chords.length > 0 ? cond.chords[cond.chords.length - 1].chord : null;

  // Mic RMS → conductor dynamics (energy tracking for live accompaniment)
  useEffect(() => {
    if (diagnostics) {
      cond.pushEnergy(diagnostics.inputRms, performance.now());
    }
  }, [diagnostics, cond]);

  const musicalState = useMemo(() => cond.getMusicalState(), [cond]);

  const timelineNotes: TimelineNote[] = useMemo(() => {
    return musicalState.melody.map((n) => ({
      ...n,
      open: false,
    }));
  }, [musicalState.melody]);

  const timelinePhrases: TimelinePhrase[] = useMemo(() => {
    return cond.getPhrases().map((p) => ({
      id: p.id,
      startTime: p.startTime,
      endTime: p.endTime,
    }));
  }, [cond]);

  // Phase 10: onboarding signals + status card + audio-health advisories.
  const everLive = running || history.length > 0;
  const step = deriveOnboardingStep({
    micLive: everLive,
    hasNote: musicalState.melody.length > 0,
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
      {/* Retro Brand Header */}
      <header className="brand">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <RadioIcon size={24} style={{ color: "var(--accent)" }} />
          <h1>
            LOOKA <span>MUSIC</span>
          </h1>
          <span className="retro-badge" style={{ fontSize: "10px", padding: "2px 8px" }}>
            HI-FI CONCERT
          </span>
        </div>

        <div className="state-readout" aria-label="Current musical state">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className={`pilot-jewel ${running ? "on" : ""}`} aria-hidden />
            {running ? "ON AIR / TOCANDO" : "STANDBY"}
          </span>
          <span>
            TOM <strong data-testid="key">{keyLabel(cond.key.root, cond.key.mode)}</strong>
          </span>
          <span>
            <strong data-testid="bpm">{bpm}</strong> BPM
          </span>
          <span>
            <strong data-testid="meter">{meterText}</strong>
          </span>
          <span>
            ACORDE <strong data-testid="chord">{chordLabel ? `${KEY_NAMES[chordLabel.root]} ${chordLabel.quality}` : "—"}</strong>
          </span>

          <Link href="/session" className="ghost" style={{ fontSize: "11px", textDecoration: "none", padding: "6px 10px" }} data-testid="nav-session">
            <MicIcon size={13} /> SESSÃO
          </Link>
          <Link href="/compose" className="ghost" style={{ fontSize: "11px", textDecoration: "none", padding: "6px 10px" }} data-testid="nav-compose">
            <PianoIcon size={13} /> ESTÚDIO
          </Link>
          <Link href="/learn" className="ghost" style={{ fontSize: "11px", textDecoration: "none", padding: "6px 10px" }} data-testid="nav-learn">
            <GraduationIcon size={13} /> TEORIA
          </Link>
        </div>
      </header>

      {showOnboarding && (
        <OnboardingGuide
          step={step}
          onStartMic={start}
          onFinish={dismissOnboarding}
          onDismiss={dismissOnboarding}
        />
      )}

      {showCard && card && (
        <StatusCard card={card} onRetry={start} onOpenHelp={() => setHelpOpen(true)} />
      )}

      {health.map((flag) => (
        <AudioHealthCard key={flag} flag={flag} />
      ))}

      {/* Retro Voice & Tuner Section */}
      <section className="panel" aria-label="Voice melody and retro radio meters">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <h2>VOZ E AFINAÇÃO ANALÓGICA</h2>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            Hot Drum Pickup &lt; 50ms · Resposta Harmônica Automática
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginTop: "12px" }}>
          {/* Analog VU Meter */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <RetroVuMeter
              level01={diagnostics ? diagnostics.inputRms * 3.5 : 0}
              label="MIC INPUT LEVEL"
            />
          </div>

          {/* Retro Frequency Dial */}
          <div style={{ flex: 1, minWidth: "280px" }}>
            <RetroTunerScale
              frequency={current?.frequency ?? 0}
              confidence={current?.confidence ?? 0}
              voiced={voiced}
            />
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {running ? `You are singing ${noteName}` : "Microphone idle"}
        </p>

        {/* Pitch history visualizer */}
        <div style={{ marginTop: "14px" }}>
          <PitchCanvas history={history} />
        </div>
      </section>

      {/* Note Timeline */}
      <section className="panel" aria-label="Note timeline">
        <h2>LINHA DO TEMPO DE NOTAS</h2>
        <NoteTimeline notes={timelineNotes} phrases={timelinePhrases} bpm={bpm} />
      </section>

      {/* Active Band & Accompaniment Controls */}
      <section
        className={`panel${step === 3 ? " spotlight" : ""}`}
        aria-label="Active band"
        aria-describedby={step === 3 ? "onboarding-band-hint" : undefined}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>BANDA AO VIVO & ACOMPANHAMENTO</h2>
          <span className="retro-badge">
            Sincronização 100% On-Device
          </span>
        </div>

        {step === 3 && (
          <p className="hint" id="onboarding-band-hint" role="note">
            Esta é a sua banda — cante para ouvi-la tocar automaticamente com você.
          </p>
        )}

        {cond.mixer && (
          <BandPanel
            mixer={cond.mixer}
            auditioning={null}
            lateTotal={cond.lateTotal}
            onAudition={(id) => cond.toggleInstrument(id)}
            onToggleMute={cond.toggleMute}
            onToggleSolo={cond.toggleSolo}
            onVolume={cond.setVolume}
            onPan={cond.setPan}
            onStop={() => {}}
          />
        )}

        <ArrangementPanel
          styles={cond.styles}
          styleId={cond.styleId}
          energyMode="auto"
          energy01={cond.energy01}
          energyLevel={cond.energyLevel}
          arrangement={cond.getMusicalState().arrangement}
          pending={cond.pendingFull}
          currentBar={cond.currentBar}
          lastFadeSec={null}
          targetDensity={cond.density}
          onStyle={cond.setStyle}
          onEnergyMode={cond.setEnergyMode}
          onToggleInstrument={cond.toggleInstrument}
        />
      </section>

      {/* Master Session Transport */}
      <section className="panel" aria-label="Transport">
        <h2>CONTROLE PRINCIPAL</h2>
        <div className="controls">
          {running ? (
            <button className="primary stop" onClick={stop} aria-label="Parar regência">
              <StopIcon size={16} /> PARAR REGÊNCIA
            </button>
          ) : (
            <button
              className="primary"
              onClick={start}
              disabled={status === "requesting"}
              aria-label="Iniciar regência com a banda"
            >
              <PlayIcon size={16} /> {status === "requesting" ? "SOLICITANDO MIC…" : "INICIAR / CANTAR"}
            </button>
          )}

          <Link
            href="/session"
            className="ghost"
            style={{ textDecoration: "none" }}
            data-testid="cta-full-session"
            title="Abrir o Regente Completo em /session com câmera e gestos"
          >
            <MicIcon size={15} /> REGENTE & GESTOS
          </Link>

          <Link
            href="/compose"
            className="ghost"
            style={{ textDecoration: "none" }}
          >
            <FolderIcon size={15} /> PROJETOS SALVOS
          </Link>

          <button className="ghost" onClick={() => setShowDiag((v) => !v)}>
            <DiagnosticsIcon size={15} /> {showDiag ? "OCULTAR DIAGNÓSTICOS" : "DIAGNÓSTICOS (D)"}
          </button>

          <button ref={helpBtnRef} className="ghost" onClick={() => setHelpOpen(true)} data-testid="help-open">
            <HelpIcon size={15} /> AJUDA (?)
          </button>
        </div>
        <p className="hint">
          Atalhos: <kbd>S</kbd> iniciar/parar · <kbd>D</kbd> diagnósticos · <kbd>?</kbd> ajuda.
          O áudio e o acompanhamento funcionam 100% no seu dispositivo sem envio de voz para servidores.
        </p>
      </section>

      {/* System Modules Navigation Cards */}
      <section className="panel" aria-label="Módulos do Sistema">
        <h2>MÓDULOS DE CRIAÇÃO E ESTÚDIO</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "14px", marginTop: "12px" }}>
          <div className="retro-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <MicIcon size={18} style={{ color: "var(--accent)" }} />
              <h3 style={{ fontSize: "14px", margin: 0, fontWeight: 700 }}>Regente & Gestos</h3>
            </div>
            <p className="meta" style={{ fontSize: "12px", margin: "0 0 12px", lineHeight: "1.4" }}>
              Hot drum pickup em 50ms, latência &lt; 125ms, visão on-device com 9 gestos canônicos.
            </p>
            <Link href="/session" className="primary" style={{ fontSize: "12px", padding: "6px 12px", textDecoration: "none" }}>
              Abrir Regente <ChevronRightIcon size={13} />
            </Link>
          </div>

          <div className="retro-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <PianoIcon size={18} style={{ color: "var(--accent)" }} />
              <h3 style={{ fontSize: "14px", margin: 0, fontWeight: 700 }}>Estúdio & Timeline</h3>
            </div>
            <p className="meta" style={{ fontSize: "12px", margin: "0 0 12px", lineHeight: "1.4" }}>
              Editor de timeline, audição de notas, quantização 1/16 e regeneração harmônica.
            </p>
            <Link href="/compose" className="ghost" style={{ fontSize: "12px", padding: "6px 12px", textDecoration: "none" }}>
              Ver Projetos <ChevronRightIcon size={13} />
            </Link>
          </div>

          <div className="retro-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <DownloadIcon size={18} style={{ color: "var(--accent)" }} />
              <h3 style={{ fontSize: "14px", margin: 0, fontWeight: 700 }}>Exportação Offline</h3>
            </div>
            <p className="meta" style={{ fontSize: "12px", margin: "0 0 12px", lineHeight: "1.4" }}>
              MIDI Formato 1, WAV 16-bit PCM estéreo (44.1 kHz), JSON v1 e WebM/Opus.
            </p>
            <Link href="/compose" className="ghost" style={{ fontSize: "12px", padding: "6px 12px", textDecoration: "none" }}>
              Exportar Músicas <ChevronRightIcon size={13} />
            </Link>
          </div>

          <div className="retro-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <GraduationIcon size={18} style={{ color: "var(--accent)" }} />
              <h3 style={{ fontSize: "14px", margin: 0, fontWeight: 700 }}>Teoria & Pedagogia</h3>
            </div>
            <p className="meta" style={{ fontSize: "12px", margin: "0 0 12px", lineHeight: "1.4" }}>
              9 níveis progressivos, cadências e funções em pt-BR (zero LLM no motor musical).
            </p>
            <Link href="/learn" className="ghost" style={{ fontSize: "12px", padding: "6px 12px", textDecoration: "none" }}>
              Laboratório <ChevronRightIcon size={13} />
            </Link>
          </div>
        </div>
      </section>

      {showDiag && <DiagnosticsPanel current={current} diagnostics={diagnostics} />}

      {helpOpen && <HelpDialog scope="home" onClose={() => setHelpOpen(false)} />}

      <footer className="creed">
        Você canta a melodia. O LookaMusic constrói a banda ao vivo.
      </footer>
    </main>
  );
}
