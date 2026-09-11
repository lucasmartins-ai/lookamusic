/**
 * Desktop updater — outside Tauri it must no-op (web/PWA/vitest).
 * Run: npm test -- desktop-updater
 */
import { describe, expect, it } from "vitest";
import { checkForUpdate, downloadAndInstallUpdate } from "@/features/desktop/updater";

describe("desktop updater (non-Tauri runtime)", () => {
  it("check returns not-tauri without touching native bindings", async () => {
    const res = await checkForUpdate();
    expect(res.phase).toBe("not-tauri");
    expect(res.info).toBeNull();
  });

  it("install returns not-tauri without touching native bindings", async () => {
    const res = await downloadAndInstallUpdate();
    expect(res.phase).toBe("not-tauri");
  });
});
