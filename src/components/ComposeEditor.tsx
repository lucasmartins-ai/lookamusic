"use client";

/**
 * ComposeEditor — Composition Timeline Editor (Phase 11, §41).
 * Shared by `/compose/[id]` (web) and `/compose/editor?id=` (static/desktop).
 * Loads project from IndexedDB, allows editing melody, chords, tempo,
 * instrumentation and regenerating accompaniment. Bit-identical replay.
 * Full Web Audio playback via CompositionPlayer and note auditioning.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadComposition, saveComposition } from "@/features/recording/storage";
import { createDefaultComposition } from "@/features/recording/schema";
import { TimelineEditor } from "@/components/TimelineEditor";
import { ExportModal } from "@/components/ExportModal";
import { CompositionPlayer } from "@/features/recording/player";
import {
  PlayIcon,
  StopIcon,
  SaveIcon,
  DownloadIcon,
  FolderIcon,
  ChevronLeftIcon,
  RadioIcon,
} from "@/components/icons";
import type { Composition } from "@/domain/types";

export function ComposeEditor({ id }: { id: string }) {
  const [composition, setComposition] = useState<Composition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const playerRef = useRef<CompositionPlayer | null>(null);

  useEffect(() => {
    playerRef.current = new CompositionPlayer();
    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const comp = await loadComposition(id);
        if (mounted) {
          if (comp) {
            setComposition(comp);
          } else {
            // Create a default if ID is new or not found
            const fallback = createDefaultComposition({ id, name: `Composição ${id.slice(0, 6)}` });
            setComposition(fallback);
          }
        }
      } catch (err) {
        console.error("Failed to load composition:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleSave = async () => {
    if (!composition) return;
    setSaving(true);
    try {
      await saveComposition(composition);
      setSaveStatus("Projeto salvo com sucesso!");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error("Failed to save:", err);
      setSaveStatus("Erro ao salvar projeto.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePlay = () => {
    if (!composition || !playerRef.current) return;
    if (isPlaying) {
      playerRef.current.stop();
      setIsPlaying(false);
      setPlayheadSec(0);
      return;
    }

    setIsPlaying(true);
    const ok = playerRef.current.play(
      composition,
      (sec) => setPlayheadSec(sec),
      () => {
        setIsPlaying(false);
        setPlayheadSec(0);
      },
    );

    if (!ok) {
      setIsPlaying(false);
    }
  };

  const handlePreviewNote = (midi: number) => {
    playerRef.current?.previewNote(midi);
  };

  if (loading) {
    return (
      <main className="stage" id="main">
        <header className="brand">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <RadioIcon size={22} style={{ color: "var(--accent)" }} />
            <h1>
              LOOKA <span>EDITOR</span>
            </h1>
          </div>
        </header>
        <div className="notice tone-loading" role="status" style={{ marginTop: "24px" }}>
          <strong>CARREGANDO COMPOSIÇÃO…</strong>
        </div>
      </main>
    );
  }

  if (!composition) {
    return (
      <main className="stage" id="main">
        <header className="brand">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <RadioIcon size={22} style={{ color: "var(--accent)" }} />
            <h1>
              LOOKA <span>EDITOR</span>
            </h1>
          </div>
        </header>
        <div className="notice tone-error" role="alert" style={{ marginTop: "24px" }}>
          <strong>COMPOSIÇÃO NÃO ENCONTRADA</strong>
          <p>O ID informado não existe na base local.</p>
          <div className="controls">
            <Link href="/session" className="primary">
              VOLTAR PARA A SESSÃO
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="stage" id="main">
      <header className="brand">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <RadioIcon size={22} style={{ color: "var(--accent)" }} />
          <h1>
            LOOKA <span>EDITOR</span>
          </h1>
          <span className="retro-badge">
            TIMELINE REC
          </span>
        </div>
        <div className="state-readout">
          <Link href="/session" className="ghost" style={{ fontSize: "12px", textDecoration: "none" }}>
            <ChevronLeftIcon size={14} /> SESSÃO
          </Link>
          <Link href="/compose" className="ghost" style={{ fontSize: "12px", textDecoration: "none" }}>
            <FolderIcon size={14} /> PROJETOS
          </Link>
        </div>
      </header>

      {saveStatus && (
        <div className="notice tone-info" role="status" style={{ marginTop: "14px" }}>
          <strong>{saveStatus}</strong>
        </div>
      )}

      {/* Editor Transport Header */}
      <section className="panel" aria-label="Transporte do Editor">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div>
            <input
              type="text"
              value={composition.name}
              onChange={(e) => setComposition({ ...composition, name: e.target.value })}
              aria-label="Nome da Composição"
              data-testid="composition-name-input"
              style={{
                fontSize: "18px",
                fontWeight: 700,
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--line)",
                color: "var(--text)",
                padding: "4px 0",
              }}
            />
            <p className="hint" style={{ margin: "4px 0 0" }}>
              ID: <code>{composition.id}</code> · Atualizado: {new Date(composition.updatedAt).toLocaleTimeString()}
              {isPlaying && (
                <span style={{ color: "var(--accent)", marginLeft: "10px", fontWeight: 600 }}>
                  ▶ Tocando: {playheadSec.toFixed(1)}s
                </span>
              )}
            </p>
          </div>

          <div className="controls">
            <button
              className={`primary ${isPlaying ? "stop" : ""}`}
              onClick={handleTogglePlay}
              data-testid="btn-editor-replay"
              aria-label={isPlaying ? "Parar Replay" : "Tocar Replay com Áudio"}
            >
              {isPlaying ? (
                <>
                  <StopIcon size={15} /> PARAR REPLAY
                </>
              ) : (
                <>
                  <PlayIcon size={15} /> TOCAR REPLAY
                </>
              )}
            </button>
            <button className="primary" onClick={handleSave} disabled={saving} data-testid="btn-editor-save">
              <SaveIcon size={15} /> {saving ? "SALVANDO…" : "SALVAR"}
            </button>
            <button
              className="primary"
              onClick={() => setIsExportOpen(true)}
              data-testid="btn-editor-export"
            >
              <DownloadIcon size={15} /> EXPORTAR
            </button>
          </div>
        </div>
      </section>

      {/* Timeline Editor */}
      <TimelineEditor
        composition={composition}
        onChange={setComposition}
        onSave={handleSave}
        isSaving={saving}
        onPreviewNote={handlePreviewNote}
        playheadSec={playheadSec}
        isPlaying={isPlaying}
      />

      {/* Export Dialog */}
      <ExportModal
        composition={composition}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </main>
  );
}
