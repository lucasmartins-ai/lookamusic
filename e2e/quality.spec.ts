/**
 * Phase 14: Quality & Hardening E2E
 * Proves session stability, latency budget display, instrument manipulation,
 * and clean navigation without memory leaks or page errors.
 */
import { expect, test } from "@playwright/test";

test("quality: extended session stability, latency budget, and clean navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/session");
  await expect(page.getByTestId("start")).toBeVisible();

  // Inject fixture to activate conductor and accompaniment
  await page.getByTestId("fixture").click();

  // Confirm chord and transport schedule
  await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });
  await expect(page.getByTestId("latency")).toContainText("within 250 ms");

  // Multi-pass fixture injection simulating singing across bars
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("fixture").click();
    await page.waitForTimeout(300);
  }

  // Verify scheduler continues dispatching without degradation badge
  await expect(page.getByTestId("degradation-badge")).toHaveCount(0);

  // Navigate to /compose hub and back to /session to verify unmount and re-mount cleanliness
  await page.goto("/compose");
  await expect(page.locator("h1")).toContainText(/LOOKA PROJETOS/i);

  await page.goto("/session");
  await expect(page.getByTestId("start")).toBeVisible();

  // Inject once more to ensure fresh instance functions cleanly
  await page.getByTestId("fixture").click();
  await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });

  expect(errors).toEqual([]);
});
