/**
 * Sample packs E2E (Phase 16): real/synth toggle without errors on /session.
 * No pack is downloaded in CI (remote fetch) — the toggle + credits render
 * and the fallback synth keeps the band playing silently-safe.
 */
import { expect, test } from "@playwright/test";

test("session: sample real/synth toggle flips without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/session");
  await expect(page.getByTestId("sample-toggle-piano")).toBeVisible({ timeout: 10_000 });

  // Credits (Salamander CC-BY attribution) are on screen.
  await expect(page.getByTestId("sample-credits")).toContainText("Salamander");

  // Sing without a mic so the band is live behind the toggle.
  // (v1.3.3 UX: o expedidor reativo vive no MODO AVANÇADO, recolhido.)
  await page.getByTestId("toggle-advanced").click();
  await page.getByTestId("fixture").click();
  await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });

  // Toggle piano to synth and back to real: mode label follows, no errors.
  const toggle = page.getByTestId("sample-toggle-piano");
  const mode = page.getByTestId("sample-mode-piano");
  await expect(mode).toContainText("Som real");
  await toggle.click();
  await expect(mode).toContainText("Sintetizador");
  await toggle.click();
  await expect(mode).toContainText("Som real");

  // Band still scheduled through the toggle (fallback never silent).
  const transport = await page.getByTestId("transport").textContent();
  expect(transport).toMatch(/scheduled/);

  expect(errors).toEqual([]);
});
