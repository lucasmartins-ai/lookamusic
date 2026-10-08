/**
 * Sample packs E2E (TDR-22 "só sons reais"): every audible instrument is a
 * bundled recording; no real↔synth switch exists, instruments without a
 * recording are unavailable, and the band plays recorded sources only.
 */
import { expect, test } from "@playwright/test";

test("session: only recorded instruments, all packs load, band plays samples", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    const stats = { osc: 0 };
    (window as unknown as { __osc: typeof stats }).__osc = stats;
    const mk = BaseAudioContext.prototype.createOscillator;
    BaseAudioContext.prototype.createOscillator = function () {
      stats.osc++;
      return mk.call(this);
    };
  });

  await page.goto("/session");
  for (const id of ["piano", "violao", "drums", "bass", "violin", "strings"]) {
    await expect(page.getByTestId(`sample-ready-${id}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`sample-mode-${id}`)).toContainText("Som real");
  }
  await expect(page.getByTestId("sample-toggle-piano")).toHaveCount(0);
  await expect(page.getByTestId("sample-credits")).toContainText("Virtuosity Drums");
  await expect(page.getByTestId("sample-credits")).toContainText("Salamander");

  // No real recording → not offered.
  for (const id of ["guitar", "sax", "accordion"]) await expect(page.getByTestId(`band-${id}`)).toBeDisabled();

  // Band live from the fixture: scheduled, and no oscillator ever created.
  await page.getByTestId("toggle-advanced").click();
  await page.getByTestId("fixture").click();
  await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });
  await page.waitForTimeout(2000);
  expect(await page.getByTestId("transport").textContent()).toMatch(/scheduled/);
  expect(await page.evaluate(() => (window as unknown as { __osc: { osc: number } }).__osc.osc)).toBe(0);

  expect(errors).toEqual([]);
});
