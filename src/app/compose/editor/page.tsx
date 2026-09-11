"use client";

/**
 * `/compose/editor?id=` — static-friendly editor route (desktop/Tauri).
 * Same ComposeEditor as `/compose/[id]`; the id travels by query string
 * so `output: export` can pre-render this page.
 */
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ComposeEditor } from "@/components/ComposeEditor";

function EditorBody() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  if (!id) {
    return (
      <main className="stage" id="main">
        <div className="notice tone-error" role="alert" style={{ marginTop: "24px" }}>
          <strong>COMPOSIÇÃO NÃO ENCONTRADA</strong>
          <p>Nenhum ID informado (?id=).</p>
          <div className="controls">
            <Link href="/session" className="primary">
              VOLTAR PARA A SESSÃO
            </Link>
          </div>
        </div>
      </main>
    );
  }
  return <ComposeEditor id={id} />;
}

export default function ComposeEditorPage() {
  return (
    <Suspense>
      <EditorBody />
    </Suspense>
  );
}
