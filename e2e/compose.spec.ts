/**
 * Recording and Timeline Editor E2E (Phase 11, §41).
 * Tests the full flow:
 * session -> record/sing -> stop -> open in editor -> edit/quantize/regen -> save -> projects hub.
 */
import { expect, test } from "@playwright/test";

test("recording and editor flow: record, edit timeline, quantize, regen and persist", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // 1. Visit /session
  await page.goto("/session");
  await expect(page.getByTestId("btn-start-recording")).toBeVisible();

  // 2. Start recording
  await page.getByTestId("btn-start-recording").click();
  await expect(page.getByTestId("btn-stop-recording")).toBeVisible();

  // 3. Sing synthetic fixture (v1.3.3 UX: vive no MODO AVANÇADO, recolhido)
  await page.getByTestId("toggle-advanced").click();
  await page.getByTestId("fixture").click();
  await page.waitForTimeout(1000);

  // 4. Stop recording
  await page.getByTestId("btn-stop-recording").click();
  await expect(page.getByTestId("link-open-editor")).toBeVisible();

  // 5. Navigate into the editor
  await page.getByTestId("link-open-editor").click();
  await expect(page.getByTestId("timeline-editor")).toBeVisible();

  // 6. Test editor controls: add note, quantize, regen chords
  await page.getByTestId("btn-add-note").click();
  await page.getByTestId("btn-quantize").click();
  await page.getByTestId("btn-regen-chords").click();

  // 7. Save project
  await page.getByTestId("btn-editor-save").click();

  // 8. Navigate to /compose hub
  await page.goto("/compose");
  await expect(page.getByText(/COMPOSIÇÕES LOCAIS/i)).toBeVisible();
  await expect(page.getByText(/ABRIR NO EDITOR/i).first()).toBeVisible();

  expect(errors).toEqual([]);
});
