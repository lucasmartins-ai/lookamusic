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
import { buildPlayAlongComposition } from "@/features/recording/playalong";
import { CompositionPlayer } from "@/features/recording/player";
import { saveComposition } from "@/features/recording/storage";
import { TauriUpdateButton } from "@/components/TauriUpdateButton";
import type { Composition } from "@/domain/types";
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
import {
  MicIcon,
  PlayIcon,
  StopIcon,
  RecordIcon,
  PencilIcon,
  FolderIcon,
  GraduationIcon,
  BookIcon,
  HelpIcon,
  DiagnosticsIcon,
  RadioIcon,
  PlusIcon,
  CheckIcon,
} from "@/components/icons";
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

  // Hum-first (cantarolar → banda toca em loop → você acompanha).
  // Fase 1 (humming): mic aberto, banda do regente MUTA — só captura a
  // melodia em silêncio, sem o ciclo mic-recaptura-banda (notas fantasmas).
  // Fase 2 (playing): CompositionPlayer toca a música fixa em loop; o mic
  // segue aberto só p/ acompanhamento visual (coach/energia), sem reagir.
  const [humPhase, setHumPhase] = useState<"idle" | "humming" | "playing">("idle");
  const [humMsg, setHumMsg] = useState<string | null>(null);
  const [playComp, setPlayComp] = useState<Composition | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const playerRef = useRef<CompositionPlayer | null>(null);
  const keepLoop = useRef(false);
  const mutedByHum = useRef<InstrumentId[]>([]);

  const ensurePlayer = () => {
    if (!playerRef.current) playerRef.current = new CompositionPlayer();
    return playerRef.current;
  };

  useEffect(() => {
    return () => {
      keepLoop.current = false;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  const muteConductorBand = () => {
    mutedByHum.current = [];
    const mixer = cond.mixer;
    if (!mixer) return;
    for (const id of INSTRUMENTS as readonly InstrumentId[]) {
      if (cond.active[id] && !mixer[id].muted) {
        cond.toggleMute(id);
        mutedByHum.current.push(id);
      }
    }
  };

  const unmuteConductorBand = () => {
    for (const id of mutedByHum.current) cond.toggleMute(id);
    mutedByHum.current = [];
  };

  const startHum = async () => {
    setHumMsg(null);
    if (mic.status !== "running") {
      await mic.start();
    }
    muteConductorBand();
    setPlayComp(null);
    setPlayhead(0);
    setHumPhase("humming");
  };

  const loopPlay = (comp: Composition) => {
    const player = ensurePlayer();
    player.play(
      comp,
      (sec) => setPlayhead(sec),
      () => {
        if (keepLoop.current) loopPlay(comp);
        else setPlayhead(0);
      },
    );
  };

  const stopHumAndPlay = () => {
    const comp = buildPlayAlongComposition(cond.getMusicalState(), "Cantarolada");
    if (!comp) {
      setHumMsg("Cante primeiro alguns segundos — nenhuma nota estável captada ainda.");
      return;
    }
    keepLoop.current = true;
    setPlayComp(comp);
    setPlayhead(0);
    setHumMsg(null);
    setHumPhase("playing");
    loopPlay(comp);
  };

  const stopHumFlow = () => {
    keepLoop.current = false;
    playerRef.current?.stop();
    unmuteConductorBand();
    setHumPhase("idle");
    setPlayhead(0);
  };

  const saveHumSong = async () => {
    if (!playComp) return;
    try {
      await saveComposition({ ...playComp, updatedAt: new Date().toISOString() });
      await recorder.refreshList();
      setHumMsg(`Música salva ("${playComp.name}", ${playComp.melody.length} notas). Abra em PROJETOS.`);
    } catch {
      setHumMsg("Não foi possível salvar no IndexedDB.");
    }
  };

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
    const now = performance.now();
    cond.injectFixture(g4Observations(now, now + 2400), 0.2);
  };

  useEffect(() => {
    if (params.get("fixture") === "g4") {
      const t = setTimeout(singFixture, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const rawVoiced = !!(mic.current && mic.current.frequency > 0);
  // Same stabilized readout as home: lock to the open stable note when
  // present, else immediate raw mic feedback (attack window).
  const displayVoiced = cond.stableVoiced || rawVoiced;
  const displayFrequency = cond.stableVoiced ? cond.stableFrequency : (mic.current?.frequency ?? 0);
  const voiced = displayVoiced;
  const noteName = useMemo(
    () => (displayVoiced && displayFrequency > 0 ? freqToNoteName(displayFrequency) : "—"),
    [displayVoiced, displayFrequency],
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
    cond.start();
    void mic.start();
  };

  const stopSession = () => {
    void mic.stop();
    cond.stop();
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
            <GraduationIcon size={12} /> EDU {learn.enabled ? "ON" : "OFF"}
          </button>
          <Link href="/learn" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-learn">
            <BookIcon size={12} /> APRENDER
          </Link>
          <Link href="/compose" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-compose">
            <FolderIcon size={12} /> PROJETOS
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
            <button className="primary stop" onClick={stopSession} aria-label="Stop listening" data-testid="stop">
              <StopIcon size={14} /> STOP
            </button>
          ) : (
            <button
              className="primary"
              onClick={startSession}
              disabled={mic.status === "requesting"}
              aria-label="Start session"
              data-testid="start"
            >
              <PlayIcon size={14} /> {mic.status === "requesting" ? "REQUESTING MIC…" : "START SESSION"}
            </button>
          )}
          <button onClick={singFixture} aria-label="Sing synthetic fixture" data-testid="fixture">
            <RadioIcon size={14} /> SING FIXTURE (no mic)
          </button>
          <button className="ghost" onClick={() => setShowDiag((v) => !v)}>
            <DiagnosticsIcon size={14} /> {showDiag ? "HIDE DIAGNOSTICS" : "DIAGNOSTICS (D)"}
          </button>
          <button ref={helpBtnRef} className="ghost" onClick={() => setHelpOpen(true)} data-testid="help-open">
            <HelpIcon size={14} /> AJUDA (?)
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

      <section className="panel" aria-label="Cantarolar primeiro">
        <h2>CANTAROLAR PRIMEIRO (SEM TRAVA)</h2>
        <p className="hint">
          1. CANTAROLAR com a banda muda → 2. TOCAR A BANDA em loop → cante junto.
          A banda toca a música fixa; o mic só acompanha (sem reagir e sem eco).
          De preferência, use fone.
        </p>
        <div className="controls">
          {humPhase === "idle" && (
            <button className="primary" onClick={startHum} data-testid="hum-start">
              <MicIcon size={14} /> 1. CANTAROLAR (BANDA MUDA)
            </button>
          )}
          {humPhase === "humming" && (
            <>
              <button className="primary" onClick={stopHumAndPlay} data-testid="hum-play">
                <PlayIcon size={14} /> 2. TOCAR A BANDA ({cond.noteCount} NOTAS)
              </button>
              <button className="ghost stop" onClick={stopHumFlow} data-testid="hum-cancel">
                <StopIcon size={14} /> CANCELAR
              </button>
            </>
          )}
          {humPhase === "playing" && (
            <>
              <button className="primary stop" onClick={stopHumFlow} data-testid="hum-stop">
                <StopIcon size={14} /> PARAR BANDA
              </button>
              <button className="ghost" onClick={saveHumSong} data-testid="hum-save">
                <PencilIcon size={14} /> SALVAR MÚSICA
              </button>
            </>
          )}
        </div>
        <p className="meta" aria-live="polite" data-testid="hum-status">
          {humPhase === "humming" &&
            (running
              ? `Ouvindo só você… ${cond.noteCount} notas captadas. Capriche e aperte TOCAR A BANDA.`
              : "Abrindo o microfone…")}
          {humPhase === "playing" &&
            `Tocando em loop (${playhead.toFixed(1)}s) — cante junto. Mic segue aberto só p/ acompanhar.`}
          {humPhase === "idle" && "Parado."}
        </p>
        {humMsg && (
          <p className="meta" role="status" data-testid="hum-msg">
            {humMsg}
          </p>
        )}
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
              <StopIcon size={14} /> PARAR GRAVAÇÃO
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => recorder.startRecording()}
              data-testid="btn-start-recording"
            >
              <RecordIcon size={14} /> GRAVAR SESSÃO
            </button>
          )}

          {recorder.lastComposition && (
            <Link
              href={`/compose/editor?id=${recorder.lastComposition.id}`}
              className="primary"
              data-testid="link-open-editor"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              <PencilIcon size={14} /> ABRIR NO EDITOR
            </Link>
          )}

          <Link
            href="/compose"
            className="ghost"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            data-testid="link-compose-hub"
          >
            <FolderIcon size={14} /> PROJETOS SALVOS ({recorder.compositions.length})
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
                {on ? <CheckIcon size={12} /> : <PlusIcon size={12} />} {id}{pend ? " (fila)" : ""}
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

      <section className="panel" aria-label="Atualização do aplicativo">
        <TauriUpdateButton />
      </section>

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
