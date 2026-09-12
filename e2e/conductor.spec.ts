/**
 * Conductor E2E (Phase 8): start → sing via injected fixture (no mic
 * hardware in CI) → accompaniment → add/remove instruments.
 */
import { expect, test } from "@playwright/test";

test("session: fixture sings, band follows, lineup toggles quantize", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/session");
  // v1.3.3 (UX): o MODO AVANÇADO começa recolhido — a ação principal é
  // CANTAROLAR PRIMEIRO. O conductor reativo abre com um clique.
  await page.getByTestId("toggle-advanced").click();
  await expect(page.getByTestId("start")).toBeVisible();

  // Sing without a mic: synthetic G4 phrase straight into the conductor.
  await page.getByTestId("fixture").click();

  // Accompaniment follows: a chord appears and the scheduler dispatches.
  await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });
  const transport = await page.getByTestId("transport").textContent();
  expect(transport).toMatch(/scheduled/);
  const scheduled = Number((transport ?? "").match(/(\d+) scheduled/)?.[1] ?? "0");
  expect(scheduled).toBeGreaterThan(0);

  // Latency readout stays within the 250 ms budget.
  await expect(page.getByTestId("latency")).toContainText("within 250 ms");

  // Remove piano (quantized toggle): button flips to off.
  const piano = page.getByTestId("band-piano");
  await expect(piano).toHaveAttribute("data-active", "true");
  await piano.click();
  await expect
    .poll(async () => piano.getAttribute("data-active"), { timeout: 10_000 })
    .toBe("false");

  // Add it back.
  await piano.click();
  await expect
    .poll(async () => piano.getAttribute("data-active"), { timeout: 10_000 })
    .toBe("true");

  // No degradation badge at full quality, no page errors.
  await expect(page.getByTestId("degradation-badge")).toHaveCount(0);
  expect(errors).toEqual([]);
});
