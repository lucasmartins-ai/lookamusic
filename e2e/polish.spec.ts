/**
 * Polish E2E (Phase 10): onboarding, help dialog, keyboard map,
 * mobile viewports without breakage. No mic hardware needed.
 */
import { expect, test } from "@playwright/test";

test("home: onboarding guides a new user, help opens/closes via keyboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-step", "1");

  // "?" opens help, Esc closes it, focus returns to the opener.
  await page.keyboard.press("?");
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  await expect(page.getByTestId("help-dialog")).toContainText("Glossário");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("help-dialog")).toHaveCount(0);
  await expect(page.getByTestId("help-open")).toBeFocused();

  // "d" toggles diagnostics (pt-BR é o idioma da interface do usuário).
  await page.keyboard.press("d");
  await expect(page.getByText("OCULTAR DIAGNÓSTICOS")).toBeVisible();
  await page.keyboard.press("d");
  await expect(page.getByText("OCULTAR DIAGNÓSTICOS")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("session: fluxo principal em evidência, avançado recolhido e zero azul de navegador", async ({ page }) => {
  await page.goto("/session");

  // UX v1.3.3: o caminho recomendado está visível e o MODO AVANÇADO começa
  // recolhido (o conductor reativo nem entra no DOM).
  await expect(page.getByTestId("hum-steps")).toBeVisible();
  await expect(page.getByTestId("hum-start")).toBeVisible();
  await expect(page.getByTestId("start")).toHaveCount(0);
  await expect(page.getByTestId("toggle-advanced")).toHaveAttribute("aria-expanded", "false");

  // Ajuda sempre alcançável sem passar pelo modo avançado.
  await expect(page.getByTestId("help-open")).toBeVisible();

  // Design v1.3.3: nenhuma âncora pode cair no azul padrão do navegador.
  const anchorColor = await page
    .getByTestId("sample-credits")
    .locator("a")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(anchorColor).toBe("rgb(245, 158, 11)");
});

test("mobile viewport: three main screens lay out without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/session"]) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, route).toBeLessThanOrEqual(1);
  }
});

test("session: help covers gesture shortcuts, fixture flow unaffected", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/session");
  await page.getByTestId("help-open").click();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  await expect(page.getByTestId("help-dialog")).toContainText("Regência");
  await page.getByTestId("help-close").click();
  await expect(page.getByTestId("help-dialog")).toHaveCount(0);

  // Pre-existing flow still green alongside the new UI.
  // (v1.3.3 UX: o expedidor reativo vive no MODO AVANÇADO, recolhido.)
  await page.getByTestId("toggle-advanced").click();
  await page.getByTestId("fixture").click();
  await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });
  expect(errors).toEqual([]);
});
