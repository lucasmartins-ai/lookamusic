/**
 * Export E2E Spec (Phase 12, §40).
 * Tests the full export flow from the composition editor:
 * open composition -> click EXPORTAR -> modal opens -> select formats -> trigger download -> close.
 */
import { expect, test } from "@playwright/test";

test("export flow in editor: opens modal, switches format, triggers download", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // 1. Visit /session and record a short song
  await page.goto("/session");
  await page.getByTestId("btn-start-recording").click();
  await page.getByTestId("fixture").click();
  await page.waitForTimeout(500);
  await page.getByTestId("btn-stop-recording").click();

  // 2. Open editor
  await page.getByTestId("link-open-editor").click();
  await expect(page.getByTestId("btn-editor-export")).toBeVisible();

  // 3. Open Export Modal
  await page.getByTestId("btn-editor-export").click();
  await expect(page.getByTestId("export-modal")).toBeVisible();
  await expect(page.getByText(/SELECIONE O FORMATO:/i)).toBeVisible();

  // 4. Test format selection
  await expect(page.getByTestId("radio-format-wav")).toBeChecked();

  await page.getByTestId("radio-format-midi").click();
  await expect(page.getByTestId("radio-format-midi")).toBeChecked();

  await page.getByTestId("radio-format-json").click();
  await expect(page.getByTestId("radio-format-json")).toBeChecked();

  // 5. Test JSON download
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("btn-export-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.looka\.json$/);

  // 6. Close modal
  await page.getByTestId("btn-export-cancel").click();
  await expect(page.getByTestId("export-modal")).not.toBeVisible();

  expect(errors).toEqual([]);
});
