/**
 * WebM/Opus Audio Exporter via MediaRecorder (Phase 12, §40).
 * Captures rendered composition stream using the browser's native MediaRecorder.
 * Gracefully checks compatibility and reports clear errors on unsupported environments.
 */
import type { Composition } from "@/domain/types";
import { renderToWav } from "./wav";

export function isWebmExportSupported(): boolean {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return false;
  }
  return (
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ||
    MediaRecorder.isTypeSupported("audio/webm")
  );
}

export interface WebmExportOptions {
  onProgress?: (percent: number) => void;
  timesliceMs?: number;
}

/**
 * Exports a Composition to WebM format using OfflineAudioContext + MediaStreamDestination + MediaRecorder.
 */
export async function exportToWebm(
  comp: Composition,
  options: WebmExportOptions = {},
): Promise<Blob> {
  if (!isWebmExportSupported()) {
    throw new Error(
      "Exportação para WebM não é suportada neste navegador ou ambiente. Recomendamos exportar em WAV.",
    );
  }

  // 1. First render the composition audio offline
  if (options.onProgress) options.onProgress(10);
  const { blob: wavBlob, durationSec } = await renderToWav(comp, {
    onProgress: (pct) => {
      if (options.onProgress) options.onProgress(Math.round(pct * 0.5));
    },
  });

  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtxClass) {
    throw new Error("AudioContext não está disponível.");
  }

  const actx = new AudioCtxClass();
  const arrayBuf = await wavBlob.arrayBuffer();
  const audioBuf = await actx.decodeAudioData(arrayBuf);

  if (typeof actx.createMediaStreamDestination !== "function") {
    await actx.close();
    throw new Error("createMediaStreamDestination não suportado neste navegador.");
  }

  const dest = actx.createMediaStreamDestination();
  const source = actx.createBufferSource();
  source.buffer = audioBuf;
  source.connect(dest);

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  const recorder = new MediaRecorder(dest.stream, { mimeType });
  const chunks: Blob[] = [];

  return new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onerror = (err) => {
      void actx.close();
      reject(err);
    };

    recorder.onstop = () => {
      void actx.close();
      if (options.onProgress) options.onProgress(100);
      const webmBlob = new Blob(chunks, { type: mimeType });
      resolve(webmBlob);
    };

    recorder.start(options.timesliceMs ?? 100);
    source.start(0);

    const progressInterval = setInterval(() => {
      if (options.onProgress && actx.currentTime < durationSec) {
        const pct = 50 + Math.round((actx.currentTime / durationSec) * 45);
        options.onProgress(Math.min(95, pct));
      }
    }, 200);

    source.onended = () => {
      clearInterval(progressInterval);
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 100);
    };
  });
}
