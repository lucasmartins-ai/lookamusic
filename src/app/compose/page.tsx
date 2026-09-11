"use client";

/**
 * `/compose` — Compositions Hub (Phase 11, §41).
 * Lists all locally persisted compositions from IndexedDB.
 * Allows creating a new composition or opening an existing one.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CompositionSummary,
  listCompositions,
  deleteComposition,
  saveComposition,
} from "@/features/recording/storage";
import { createDefaultComposition } from "@/features/recording/schema";
import { newId } from "@/lib/ids";
import {
  RadioIcon,
  ChevronLeftIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  FolderIcon,
} from "@/components/icons";

export default function ComposeHubPage() {
  const router = useRouter();
  const [compositions, setCompositions] = useState<CompositionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadList = async () => {
    try {
      setLoading(true);
      const list = await listCompositions();
      setCompositions(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  const handleCreateNew = async () => {
    const id = newId("comp");
    const comp = createDefaultComposition({
      id,
      name: `Nova Música ${compositions.length + 1}`,
    });
    await saveComposition(comp);
    router.push(`/compose/editor?id=${id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta composição local?")) return;
    await deleteComposition(id);
    await loadList();
  };

  return (
    <main className="stage" id="main">
      <header className="brand">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <FolderIcon size={24} style={{ color: "var(--accent)" }} />
          <h1>
            LOOKA <span>PROJETOS</span>
          </h1>
          <span className="retro-badge">
            INDEXED DB
          </span>
        </div>
        <div className="state-readout">
          <Link href="/session" className="ghost" style={{ fontSize: "12px", textDecoration: "none" }}>
            <ChevronLeftIcon size={14} /> SESSÃO AO VIVO
          </Link>
          <Link href="/" className="ghost" style={{ fontSize: "12px", textDecoration: "none" }}>
            <RadioIcon size={14} /> INÍCIO
          </Link>
        </div>
      </header>

      <section className="panel" aria-label="Ações de Composição">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2>COMPOSIÇÕES LOCAIS</h2>
            <p className="hint">
              Salvas no IndexedDB deste navegador. Zero dependência de nuvem (ver <kbd>PRIVACY.md</kbd>).
            </p>
          </div>
          <div className="controls">
            <button className="primary" onClick={handleCreateNew} data-testid="btn-create-composition">
              <PlusIcon size={14} /> NOVA COMPOSIÇÃO
            </button>
          </div>
        </div>
      </section>

      <section className="panel" aria-label="Lista de Composições">
        {loading ? (
          <p className="hint">Carregando projetos…</p>
        ) : compositions.length === 0 ? (
          <div className="notice tone-info" role="status">
            <strong>NENHUMA COMPOSIÇÃO SALVA AINDA</strong>
            <p>Grave uma sessão ao vivo ou clique em &quot;NOVA COMPOSIÇÃO&quot; para criar a primeira.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            {compositions.map((comp) => (
              <div
                key={comp.id}
                className="retro-card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div>
                  <strong style={{ fontSize: "15px", color: "var(--text)" }}>{comp.name}</strong>
                  <p className="hint" style={{ margin: "4px 0 0" }}>
                    {comp.tempo} BPM · {comp.noteCount} notas · {comp.chordCount} acordes · Atualizado: {new Date(comp.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="controls">
                  <Link href={`/compose/editor?id=${comp.id}`} className="primary" style={{ padding: "8px 16px", textDecoration: "none", fontSize: "12px", minWidth: "auto" }}>
                    <PencilIcon size={13} /> ABRIR NO EDITOR
                  </Link>
                  <button
                    className="ghost stop"
                    onClick={() => handleDelete(comp.id)}
                    aria-label={`Excluir ${comp.name}`}
                    style={{ padding: "8px 12px", fontSize: "12px", minHeight: "36px" }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
