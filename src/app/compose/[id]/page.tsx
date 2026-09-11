"use client";

/**
 * `/compose/[id]` — Composition Timeline Editor Route (Phase 11, §41).
 * Loads project from IndexedDB, allows editing melody, chords, tempo,
 * instrumentation and regenerating accompaniment. Bit-identical replay.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { loadComposition, saveComposition } from "@/features/recording/storage";
import { createDefaultComposition } from "@/features/recording/schema";
import { TimelineEditor } from "@/components/TimelineEditor";
import { ExportModal } from "@/components/ExportModal";
import { reconstructSessionEvents } from "@/features/recording/replay";
import type { Composition } from "@/domain/types";

export default function ComposePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";

  const [composition, setComposition] = useState<Composition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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
    if (!composition) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    const events = reconstructSessionEvents(composition);
    const maxTime = events.length > 0 ? events[events.length - 1].timeSec : 4;

    // Simulated replay playback timer
    setTimeout(() => {
      setIsPlaying(false);
    }, (maxTime + 1) * 1000);
  };

  if (loading) {
    return (
      <main className="stage" id="main">
        <header className="brand">
          <h1>
            LOOKA <span>EDITOR</span>
          </h1>
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
          <h1>
            LOOKA <span>EDITOR</span>
          </h1>
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
        <h1>
          LOOKA <span>EDITOR</span>
        </h1>
        <div className="state-readout">
          <Link href="/session" className="ghost" style={{ fontSize: "12px", textDecoration: "none" }}>
            ◄ SESSÃO
          </Link>
          <Link href="/compose" className="ghost" style={{ fontSize: "12px", textDecoration: "none" }}>
            📂 PROJETOS
          </Link>
        </div>
      </header>

      {saveStatus && (
        <div className="notice tone-info" role="status" style={{ marginTop: "12px" }}>
          <strong>{saveStatus}</strong>
        </div>
      )}

      {/* Editor Transport Header */}
      <section className="panel" aria-label="Transporte do Editor">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
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
              ID: <code>{composition.id}</code> · Atualizado em: {new Date(composition.updatedAt).toLocaleTimeString()}
            </p>
          </div>

          <div className="controls">
            <button
              className={`primary ${isPlaying ? "stop" : ""}`}
              onClick={handleTogglePlay}
              data-testid="btn-editor-replay"
            >
              {isPlaying ? "■ PARAR REPLAY" : "▶ TOCAR REPLAY"}
            </button>
            <button className="primary" onClick={handleSave} disabled={saving} data-testid="btn-editor-save">
              {saving ? "SALVANDO…" : "💾 SALVAR"}
            </button>
            <button
              className="primary"
              onClick={() => setIsExportOpen(true)}
              data-testid="btn-editor-export"
            >
              ⬇ EXPORTAR
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
