/**
 * Desktop updater — Tauri v2 updater plugin wiring (application layer).
 * No React, no Web Audio. All Tauri imports are dynamic so the web build
 * (browser/PWA) never touches native bindings: every entry returns a
 * `not-tauri` result outside the desktop shell.
 */

export type UpdaterPhase =
  | "unknown"
  | "not-tauri"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "ready"
  | "error";

export interface UpdateInfo {
  version: string;
  notes: string | null;
  pubDate: string | null;
}

export interface CheckResult {
  phase: UpdaterPhase;
  info: UpdateInfo | null;
  message: string | null;
}

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

/** Check the release endpoint for a newer signed version. Web → not-tauri. */
export async function checkForUpdate(): Promise<CheckResult> {
  if (!isTauri()) {
    return { phase: "not-tauri", info: null, message: null };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      return { phase: "up-to-date", info: null, message: "Você já está na versão mais atual." };
    }
    return {
      phase: "available",
      info: {
        version: update.version,
        notes: null,
        pubDate: update.date ?? null,
      },
      message: `Versão ${update.version} disponível.`,
    };
  } catch (e) {
    return {
      phase: "error",
      info: null,
      message: e instanceof Error ? e.message : "Falha ao buscar atualização.",
    };
  }
}

/**
 * Download + install the pending update, then relaunch.
 * `onProgress` receives 0–100 download percent.
 */
export async function downloadAndInstallUpdate(
  onProgress?: (pct: number) => void,
): Promise<CheckResult> {
  if (!isTauri()) {
    return { phase: "not-tauri", info: null, message: null };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const update = await check();
    if (!update) {
      return { phase: "up-to-date", info: null, message: "Você já está na versão mais atual." };
    }
    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((ev) => {
      if (ev.event === "Started") {
        total = ev.data.contentLength ?? 0;
      } else if (ev.event === "Progress") {
        downloaded += ev.data.chunkLength;
        if (total > 0) onProgress?.(Math.min(100, Math.round((downloaded / total) * 100)));
      }
    });
    await relaunch();
    return { phase: "ready", info: null, message: "Atualizado. Reiniciando…" };
  } catch (e) {
    return {
      phase: "error",
      info: null,
      message: e instanceof Error ? e.message : "Falha ao instalar atualização.",
    };
  }
}
