/**
 * Educational Mode E2E (Phase 13):
 * /learn hub + interactive theory lab + session contextual panel toggle.
 */
import { expect, test } from "@playwright/test";

test("learn: interactive theory lab explains canonical figures", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: /LOOKA LEARN/i })).toBeVisible();

  // Test C–E–G demo
  await page.getByTestId("btn-demo-ceg").click();
  await expect(page.getByTestId("demo-output-summary")).toContainText("tríade de C maior");

  // Test G–D–Em–C demo
  await page.getByTestId("btn-demo-g-d-em-c").click();
  await expect(page.getByTestId("demo-output-summary")).toContainText("funções I–V–vi–IV em G");

  // Test authentic cadence demo
  await page.getByTestId("btn-demo-authentic").click();
  await expect(page.getByTestId("demo-output-title")).toContainText("Cadência Autêntica");

  expect(errors).toEqual([]);
});

test("session: educational mode toggle displays/hides contextual panel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/session");
  const toggleBtn = page.getByTestId("toggle-learn");
  await expect(toggleBtn).toBeVisible();

  // Initially, if disabled, learn-panel is not in the DOM
  const isInitiallyActive = (await toggleBtn.textContent())?.includes("ON");
  if (isInitiallyActive) {
    await toggleBtn.click();
  }
  await expect(page.getByTestId("learn-panel")).toHaveCount(0);

  // Turn it ON
  await toggleBtn.click();
  await expect(toggleBtn).toContainText("ON");
  await expect(page.getByTestId("learn-panel")).toBeVisible();
  await expect(page.getByTestId("learn-primary-title")).toBeVisible();

  // Sing synthetic fixture to verify live contextual explanation
  // (v1.3.3 UX: o expedidor reativo vive no MODO AVANÇADO, recolhido.)
  await page.getByTestId("toggle-advanced").click();
  await page.getByTestId("fixture").click();
  await expect(page.getByTestId("learn-primary-summary")).not.toBeEmpty();

  // Turn it OFF -> disappears completely
  await toggleBtn.click();
  await expect(toggleBtn).toContainText("OFF");
  await expect(page.getByTestId("learn-panel")).toHaveCount(0);

  expect(errors).toEqual([]);
});
