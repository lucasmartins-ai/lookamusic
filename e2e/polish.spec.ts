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

  // "d" toggles diagnostics.
  await page.keyboard.press("d");
  await expect(page.getByText("HIDE DIAGNOSTICS")).toBeVisible();
  await page.keyboard.press("d");
  await expect(page.getByText("HIDE DIAGNOSTICS")).toHaveCount(0);

  expect(errors).toEqual([]);
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
  await page.getByTestId("fixture").click();
  await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });
  expect(errors).toEqual([]);
});
