"use client";

/**
 * ExportModal — Export Dialog for Compositions (Phase 12, §40).
 * Accessible modal allowing users to export their music to WAV, MIDI, JSON, or WebM.
 * Displays offline rendering progress and triggers instant browser downloads.
 */
import { useEffect, useState } from "react";
import type { Composition } from "@/domain/types";
import {
  exportToJson,
  exportToMidi,
  renderToWav,
  exportToWebm,
  isWebmExportSupported,
  type ExportFormat,
} from "@/features/export";

interface ExportModalProps {
  composition: Composition;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ composition, isOpen, onClose }: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("wav");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      setStatusMessage(null);
      setErrorMessage(null);
      setIsExporting(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isExporting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  const sanitizeFilename = (name: string): string => {
    return (
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/gi, "_")
        .replace(/_+/g, "_") || "musica"
    );
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setErrorMessage(null);
    const baseName = sanitizeFilename(composition.name);

    try {
      if (selectedFormat === "json") {
        setStatusMessage("Gerando JSON versionado…");
        setProgress(50);
        const jsonStr = exportToJson(composition);
        setProgress(100);
        const blob = new Blob([jsonStr], { type: "application/json" });
        triggerDownload(blob, `${baseName}.looka.json`);
        setStatusMessage("Arquivo JSON baixado com sucesso!");
      } else if (selectedFormat === "midi") {
        setStatusMessage("Codificando Standard MIDI File (SMF Formato 1)…");
        setProgress(50);
        const midiBytes = exportToMidi(composition);
        setProgress(100);
        const blob = new Blob([midiBytes.buffer as ArrayBuffer], { type: "audio/midi" });
        triggerDownload(blob, `${baseName}.mid`);
        setStatusMessage("Arquivo MIDI baixado com sucesso!");
      } else if (selectedFormat === "wav") {
        setStatusMessage("Sintetizando áudio offline (PCM 16-bit 44.1kHz)…");
        const result = await renderToWav(composition, {
          onProgress: (pct) => setProgress(pct),
        });
        triggerDownload(result.blob, `${baseName}.wav`);
        setStatusMessage(`Áudio WAV gerado (${result.durationSec}s)! Download concluído.`);
      } else if (selectedFormat === "webm") {
        if (!isWebmExportSupported()) {
          throw new Error(
            "Seu navegador não suporta gravação direta em WebM/Opus. Recomendamos exportar em WAV.",
          );
        }
        setStatusMessage("Gravando fluxo WebM/Opus…");
        const blob = await exportToWebm(composition, {
          onProgress: (pct) => setProgress(pct),
        });
        triggerDownload(blob, `${baseName}.webm`);
        setStatusMessage("Áudio WebM gerado e baixado!");
      }
    } catch (err) {
      console.error("Export error:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Ocorreu um erro ao exportar a música.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      data-testid="export-modal"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        className="panel"
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "var(--bg-elevated, #16181d)",
          border: "1px solid var(--line, #2a2e38)",
          borderRadius: "8px",
          padding: "24px",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="export-dialog-title" style={{ margin: 0, fontSize: "1.25rem" }}>
            EXPORTAR MÚSICA
          </h2>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Fechar modal de exportação"
            style={{ fontSize: "18px", padding: "4px 8px" }}
          >
            ✕
          </button>
        </div>

        <p className="hint" style={{ margin: "8px 0 16px" }}>
          Exporte <strong>"{composition.name}"</strong> para reproduzir ou editar em DAWs e
          ferramentas externas (GarageBand, Logic, Ableton, MuseScore).
        </p>

        {errorMessage && (
          <div
            className="notice tone-error"
            role="alert"
            style={{ marginBottom: "16px", padding: "10px" }}
          >
            <strong>Erro na exportação:</strong>
            <p style={{ margin: "4px 0 0", fontSize: "13px" }}>{errorMessage}</p>
          </div>
        )}

        {statusMessage && !errorMessage && (
          <div
            className="notice tone-info"
            role="status"
            aria-live="polite"
            style={{ marginBottom: "16px", padding: "10px" }}
          >
            <strong>{statusMessage}</strong>
          </div>
        )}

        {/* Format Selection List */}
        <fieldset
          style={{
            border: "none",
            padding: 0,
            margin: "0 0 20px 0",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <legend style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>
            SELECIONE O FORMATO:
          </legend>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px",
              border:
                selectedFormat === "wav"
                  ? "1px solid var(--accent, #4ade80)"
                  : "1px solid var(--line, #2a2e38)",
              borderRadius: "6px",
              cursor: "pointer",
              backgroundColor: selectedFormat === "wav" ? "rgba(74, 222, 128, 0.05)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="exportFormat"
              value="wav"
              checked={selectedFormat === "wav"}
              onChange={() => setSelectedFormat("wav")}
              disabled={isExporting}
              data-testid="radio-format-wav"
              style={{ marginTop: "3px" }}
            />
            <div>
              <strong>WAV (Áudio Lossless)</strong>
              <p className="hint" style={{ margin: "2px 0 0", fontSize: "12px" }}>
                Renderização offline PCM 16-bit estéreo a 44.1 kHz. Fidelidade máxima de estúdio.
              </p>
            </div>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px",
              border:
                selectedFormat === "midi"
                  ? "1px solid var(--accent, #4ade80)"
                  : "1px solid var(--line, #2a2e38)",
              borderRadius: "6px",
              cursor: "pointer",
              backgroundColor: selectedFormat === "midi" ? "rgba(74, 222, 128, 0.05)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="exportFormat"
              value="midi"
              checked={selectedFormat === "midi"}
              onChange={() => setSelectedFormat("midi")}
              disabled={isExporting}
              data-testid="radio-format-midi"
              style={{ marginTop: "3px" }}
            />
            <div>
              <strong>MIDI (SMF Formato 1)</strong>
              <p className="hint" style={{ margin: "2px 0 0", fontSize: "12px" }}>
                Standard MIDI File multitrack com trilha de Conductor, Melodia e Acordes.
              </p>
            </div>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px",
              border:
                selectedFormat === "json"
                  ? "1px solid var(--accent, #4ade80)"
                  : "1px solid var(--line, #2a2e38)",
              borderRadius: "6px",
              cursor: "pointer",
              backgroundColor: selectedFormat === "json" ? "rgba(74, 222, 128, 0.05)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="exportFormat"
              value="json"
              checked={selectedFormat === "json"}
              onChange={() => setSelectedFormat("json")}
              disabled={isExporting}
              data-testid="radio-format-json"
              style={{ marginTop: "3px" }}
            />
            <div>
              <strong>JSON (Projeto LookaMusic)</strong>
              <p className="hint" style={{ margin: "2px 0 0", fontSize: "12px" }}>
                Arquivo estruturado com schema v1. Permite backup e reimportação exata no editor.
              </p>
            </div>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px",
              border:
                selectedFormat === "webm"
                  ? "1px solid var(--accent, #4ade80)"
                  : "1px solid var(--line, #2a2e38)",
              borderRadius: "6px",
              cursor: "pointer",
              backgroundColor: selectedFormat === "webm" ? "rgba(74, 222, 128, 0.05)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="exportFormat"
              value="webm"
              checked={selectedFormat === "webm"}
              onChange={() => setSelectedFormat("webm")}
              disabled={isExporting}
              data-testid="radio-format-webm"
              style={{ marginTop: "3px" }}
            />
            <div>
              <strong>WebM (Áudio Comprimido)</strong>
              <p className="hint" style={{ margin: "2px 0 0", fontSize: "12px" }}>
                Codec Opus nativo via MediaRecorder. Arquivo leve para envio rápido na web.
              </p>
            </div>
          </label>
        </fieldset>

        {/* Progress Bar */}
        {isExporting && (
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                marginBottom: "4px",
              }}
            >
              <span>Progresso</span>
              <span>{progress}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "var(--line, #2a2e38)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  backgroundColor: "var(--accent, #4ade80)",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            disabled={isExporting}
            data-testid="btn-export-cancel"
          >
            FECHAR
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleExport}
            disabled={isExporting}
            data-testid="btn-export-download"
          >
            {isExporting ? `GERANDO (${progress}%)…` : "⬇ GERAR E BAIXAR"}
          </button>
        </div>
      </div>
    </div>
  );
}
