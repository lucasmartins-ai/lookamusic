import { describe, it, expect } from "vitest";
import { isWebmExportSupported, exportToWebm } from "@/features/export/webm";
import { createDefaultComposition } from "@/features/recording/schema";

describe("WebM/Opus Audio Export (Phase 12, §40)", () => {
  it("detects WebM environment capability safely", () => {
    // In node/vitest environment, MediaRecorder is undefined
    const supported = isWebmExportSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("throws descriptive error explaining WAV alternative when WebM is unsupported", async () => {
    const comp = createDefaultComposition();
    if (!isWebmExportSupported()) {
      await expect(exportToWebm(comp)).rejects.toThrowError(
        /Exportação para WebM não é suportada.*Recomendamos exportar em WAV/,
      );
    }
  });
});
