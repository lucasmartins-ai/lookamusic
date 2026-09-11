"use client";

/**
 * TauriUpdateButton — renders only inside the Tauri desktop shell
 * (returns null on web). Pure renderer over `features/desktop/updater`.
 */
import { useEffect, useState } from "react";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdaterPhase,
} from "@/features/desktop/updater";

export function TauriUpdateButton() {
  const [phase, setPhase] = useState<UpdaterPhase>("unknown");
  const [version, setVersion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  // SSR renders null; the Tauri check runs only after mount so the
  // server/client trees always agree (no hydration mismatch).
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  if (!("__TAURI_INTERNALS__" in window)) return null;

  const busy = phase === "checking" || phase === "downloading" || phase === "installing";

  const onCheck = async () => {
    setPhase("checking");
    setMessage(null);
    const res = await checkForUpdate();
    setPhase(res.phase);
    setMessage(res.message);
    setVersion(res.info?.version ?? null);
  };

  const onInstall = async () => {
    setPhase("downloading");
    setProgress(0);
    setMessage(null);
    const res = await downloadAndInstallUpdate((pct) => setProgress(pct));
    setPhase(res.phase === "ready" ? "installing" : res.phase);
    setMessage(res.message);
  };

  const label =
    phase === "checking"
      ? "BUSCANDO ATUALIZAÇÃO…"
      : phase === "downloading" || phase === "installing"
        ? `INSTALANDO ${progress}%…`
        : phase === "available"
          ? `ATUALIZAR PARA v${version}`
          : phase === "up-to-date"
            ? "APP ATUALIZADO ✓"
            : "BUSCAR ATUALIZAÇÃO";

  return (
    <div className="controls" aria-label="Atualização do aplicativo">
      {phase === "available" ? (
        <button className="primary" onClick={onInstall} data-testid="tauri-update-install">
          {label}
        </button>
      ) : (
        <button
          className="ghost"
          onClick={onCheck}
          disabled={busy}
          data-testid="tauri-update-check"
        >
          {label}
        </button>
      )}
      {message && (
        <span className="meta" role="status" data-testid="tauri-update-msg">
          {message}
        </span>
      )}
    </div>
  );
}
