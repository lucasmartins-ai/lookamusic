"use client";

/**
 * `/learn` — Educational Studio & Interactive Theory Lab (Phase 13, §4).
 * Explores the progressive 9 levels of music theory.
 * Allows trying canonical figures (C–E–G, G–D–Em–C, Cadences) and
 * managing the global educational mode toggle.
 */

import { useState } from "react";
import Link from "next/link";
import { LEARN_LEVELS, type LearnLevel } from "@/features/learn/types";
import {
  explainChord,
  explainProgression,
  explainCadence,
  explainInterval,
  explainScale,
  explainState,
  explainMelodyPcs,
} from "@/features/learn/explain";
import { useLearnSettings } from "@/features/learn/useLearnSettings";
import { getScale } from "@/features/music/theory/scales";
import {
  GraduationIcon,
  MicIcon,
  FolderIcon,
  PlayIcon,
  StopIcon,
} from "@/components/icons";
import type { Chord, KeyEstimate, MusicalState, NoteEvent } from "@/domain/types";

export default function LearnPage() {
  const { enabled, level, toggleEnabled, setLevel } = useLearnSettings();
  const [activeTab, setActiveTab] = useState<LearnLevel>(level);
  const [demoOutput, setDemoOutput] = useState<{
    title: string;
    summary: string;
    details?: string;
    technicalDetails?: string;
    fixtureName: string;
  }>({
    fixtureName: "C–E–G (Tríade de C maior)",
    title: "Tríade de C maior",
    summary: "Você cantou as notas C, E e G, formando a tríade de C maior.",
    details: "Arpejo reconhecido: as notas cantadas no tempo montam o acorde C.",
    technicalDetails: "Acorde detectado: C a partir de [C, E, G]",
  });

  // Test bench helper functions
  const runDemoCEG = () => {
    const snippet = explainMelodyPcs([0, 4, 7]);
    setDemoOutput({
      fixtureName: "C–E–G (Tríade de C maior)",
      title: snippet.title,
      summary: snippet.summary,
      details: snippet.details,
      technicalDetails: snippet.technicalDetails,
    });
    setActiveTab("chords");
  };

  const runDemoGDEmC = () => {
    const key: KeyEstimate = { root: 7, mode: "major", confidence: 1 };
    const chords: Chord[] = [
      { root: 7, quality: "major" }, // G
      { root: 2, quality: "major" }, // D
      { root: 4, quality: "minor" }, // Em
      { root: 0, quality: "major" }, // C
    ];
    const snippet = explainProgression(chords, key);
    setDemoOutput({
      fixtureName: "G–D–Em–C em G (I–V–vi–IV)",
      title: snippet.title,
      summary: snippet.summary,
      details: snippet.details,
      technicalDetails: snippet.technicalDetails,
    });
    setActiveTab("progressions");
  };

  const runDemoCadence = (type: "authentic" | "plagal" | "deceptive" | "half") => {
    const key: KeyEstimate = { root: 0, mode: "major", confidence: 1 };
    let from: Chord = { root: 7, quality: "major" }; // G (V)
    let to: Chord = { root: 0, quality: "major" }; // C (I)

    if (type === "plagal") {
      from = { root: 5, quality: "major" }; // F (IV)
      to = { root: 0, quality: "major" }; // C (I)
    } else if (type === "deceptive") {
      from = { root: 7, quality: "major" }; // G (V)
      to = { root: 9, quality: "minor" }; // Am (vi)
    } else if (type === "half") {
      from = { root: 0, quality: "major" }; // C (I)
      to = { root: 7, quality: "major" }; // G (V)
    }

    const snippet = explainCadence({ type, from, to }, key);
    setDemoOutput({
      fixtureName: `Cadência ${type}`,
      title: snippet.title,
      summary: snippet.summary,
      details: snippet.details,
      technicalDetails: snippet.technicalDetails,
    });
    setActiveTab("cadence");
  };

  const runDemoAtonal = () => {
    const snippet = explainMelodyPcs([1, 6, 8, 11]); // C#, F#, G#, B
    setDemoOutput({
      fixtureName: "Entrada Atonal / Cromática",
      title: snippet.title,
      summary: snippet.summary,
      details: snippet.details,
      technicalDetails: snippet.technicalDetails,
    });
  };

  return (
    <main className="stage" id="main" tabIndex={-1}>
      <header className="brand">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <GraduationIcon size={22} style={{ color: "var(--accent)" }} />
          <h1>
            LOOKA <span>LEARN</span>
          </h1>
          <span className="retro-badge">THEORY LAB</span>
        </div>
        <div className="state-readout" aria-label="Navegação e status educacional">
          <span>
            MODO EDUCATIVO: <strong data-testid="learn-status-indicator">{enabled ? "ATIVADO" : "DESATIVADO"}</strong>
          </span>
          <Link href="/session" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-session">
            <MicIcon size={12} /> SESSÃO AO VIVO
          </Link>
          <Link href="/compose" className="ghost" style={{ fontSize: "11px", textDecoration: "none" }} data-testid="nav-compose">
            <FolderIcon size={12} /> PROJETOS
          </Link>
        </div>
      </header>

      {/* Global Toggle Banner */}
      <section className="panel" aria-label="Configuração do Modo Educacional">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ margin: 0 }}>Modo Educacional na Sessão</h2>
            <p className="hint" style={{ margin: "4px 0 0 0" }}>
              Quando ativado, o painel contextual <em>&quot;O que acabou de acontecer?&quot;</em> acompanha você em tempo real durante a cantoria.
              Quando desativado, o instrumento fica 100% focado no som, com zero peso acadêmico.
            </p>
          </div>
          <button
            className={enabled ? "primary stop" : "primary"}
            onClick={toggleEnabled}
            data-testid="toggle-learn-enabled"
            style={{ minWidth: "180px" }}
          >
            {enabled ? (
              <>
                <StopIcon size={14} /> DESATIVAR MODO EDUCATIVO
              </>
            ) : (
              <>
                <PlayIcon size={14} /> ATIVAR MODO EDUCATIVO
              </>
            )}
          </button>
        </div>
      </section>

      {/* Interactive Theory Lab */}
      <section className="panel" aria-label="Laboratório Interativo">
        <h2>LABORATÓRIO DE TEORIA VIVA</h2>
        <p className="hint">
          Experimente como as figuras musicais canônicas são explicadas em representação estruturada pura:
        </p>

        <div className="controls" style={{ gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
          <button onClick={runDemoCEG} data-testid="btn-demo-ceg">
            C–E–G (Tríade C)
          </button>
          <button onClick={runDemoGDEmC} data-testid="btn-demo-g-d-em-c">
            G–D–Em–C (I–V–vi–IV)
          </button>
          <button onClick={() => runDemoCadence("authentic")} data-testid="btn-demo-authentic">
            Cadência Autêntica (V → I)
          </button>
          <button onClick={() => runDemoCadence("plagal")} data-testid="btn-demo-plagal">
            Cadência Plagal (IV → I)
          </button>
          <button onClick={() => runDemoCadence("deceptive")} data-testid="btn-demo-deceptive">
            Cadência de Engano (V → vi)
          </button>
          <button onClick={() => runDemoCadence("half")} data-testid="btn-demo-half">
            Semicadência (I → V)
          </button>
          <button className="ghost" onClick={runDemoAtonal} data-testid="btn-demo-atonal">
            Som Livre / Atonal
          </button>
        </div>

        {/* Demo Output Card */}
        <div
          style={{
            marginTop: "16px",
            background: "var(--panel-2)",
            border: "1px solid var(--accent)",
            borderRadius: "8px",
            padding: "16px",
          }}
          data-testid="demo-output-card"
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
              Exemplo: {demoOutput.fixtureName}
            </span>
            {demoOutput.technicalDetails && (
              <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--faint)" }}>
                {demoOutput.technicalDetails}
              </span>
            )}
          </div>
          <h3 style={{ margin: "0 0 6px 0", color: "var(--accent)" }} data-testid="demo-output-title">
            {demoOutput.title}
          </h3>
          <p style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 6px 0" }} data-testid="demo-output-summary">
            {demoOutput.summary}
          </p>
          {demoOutput.details && (
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }} data-testid="demo-output-details">
              {demoOutput.details}
            </p>
          )}
        </div>
      </section>

      {/* Progressive Curriculum (9 Levels) */}
      <section className="panel" aria-label="Trilha Progressiva">
        <h2>TRILHA DE APRENDIZADO (9 NÍVEIS)</h2>
        <p className="hint">
          Cada nível destrava um olhar mais profundo sobre a música, do som isolado até a estrutura completa da composição:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginTop: "16px" }}>
          {LEARN_LEVELS.map((lvl) => {
            const isCurrent = lvl.id === level;
            return (
              <div
                key={lvl.id}
                style={{
                  background: isCurrent ? "var(--panel-2)" : "var(--bg)",
                  border: isCurrent ? "1px solid var(--accent)" : "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <strong style={{ color: isCurrent ? "var(--accent)" : "var(--text)" }}>
                      {lvl.order}. {lvl.title}
                    </strong>
                    {isCurrent && (
                      <span style={{ fontSize: "10px", background: "var(--accent-dim)", color: "#fff", padding: "2px 6px", borderRadius: "10px" }}>
                        ATIVO NA SESSÃO
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
                    {lvl.shortDescription}
                  </p>
                </div>

                <div style={{ marginTop: "12px" }}>
                  <button
                    className="ghost"
                    style={{ fontSize: "11px", width: "100%" }}
                    onClick={() => {
                      setLevel(lvl.id);
                      setActiveTab(lvl.id);
                    }}
                    data-testid={`btn-select-level-${lvl.id}`}
                  >
                    {isCurrent ? "✓ Nível Ativo" : "Definir como Nível Ativo"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="creed">
        Você canta a música. O LookaMusic constrói a banda e revela a harmonia.
      </footer>
    </main>
  );
}
