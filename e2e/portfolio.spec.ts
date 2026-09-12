/**
 * Portfolio Smoke & Demo Visual Capture (Phase 15).
 * Exercises the end-to-end workflow:
 * 1. Home / Landing with navigation
 * 2. Session / Conductor: fixture singing → real-time band accompaniment → gestures
 * 3. Learn / Theory Lab: interactive explanations for triads, cadences, progressions
 * 4. Compose / Editor: recorded session timeline, note editing, harmonic regeneration
 * 5. Export Modal: multitrack MIDI, WAV, JSON, WebM formats
 * Captures clean high-resolution screenshots into public/demo/ for documentation and README.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("Portfolio release smoke test & demo visual suite", () => {
  test.setTimeout(90_000);
  const demoDir = path.resolve(process.cwd(), "public/demo");

  test.beforeAll(() => {
    if (!fs.existsSync(demoDir)) {
      fs.mkdirSync(demoDir, { recursive: true });
    }
  });

  test("captures end-to-end demo flows across all core product surfaces", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // 1. Home Page
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto("/");
    await expect(page.getByTestId("onboarding")).toBeVisible();
    await expect(page.getByTestId("nav-session")).toBeVisible();
    await page.screenshot({ path: path.join(demoDir, "01-home.png"), fullPage: false });

    // 2. Conductor Session with synthetic singing fixture
    // (v1.3.3 UX: o conductor reativo e os gestos começam recolhidos.)
    await page.goto("/session");
    await page.getByTestId("toggle-advanced").click();
    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page.getByTestId("key")).toHaveText("C major");
    await expect(page.getByTestId("chord")).toHaveText("—");

    // Trigger fixture: voice sings synthetic G4
    await page.getByTestId("fixture").click();

    // Assert that the conductor receives notes, estimates harmony and triggers band
    await expect(page.getByTestId("chord")).not.toHaveText("—", { timeout: 10_000 });
    await expect(page.getByTestId("latency")).toContainText("Voice→band p95");

    // Toggle instruments in the band lineup
    await page.getByTestId("band-bass").click();
    await page.getByTestId("band-piano").click();

    // Select gesture (painel de gestos recolhido por padrão na v1.3.3)
    await page.getByTestId("toggle-gestures").click();
    await page.getByTestId("gesture-btn-OPEN_HAND").click();

    await page.screenshot({ path: path.join(demoDir, "02-conductor-session.png"), fullPage: false });

    // 3. Interactive Educational Theory Lab
    await page.goto("/learn");
    await expect(page.getByRole("heading", { name: /LOOKA LEARN/i })).toBeVisible();

    // Trigger canonical triad demo
    await page.getByTestId("btn-demo-ceg").click();
    await expect(page.getByTestId("demo-output-summary")).toContainText("tríade de C maior");

    // Trigger canonical progression demo
    await page.getByTestId("btn-demo-g-d-em-c").click();
    await expect(page.getByTestId("demo-output-summary")).toContainText("funções I–V–vi–IV em G");

    await page.screenshot({ path: path.join(demoDir, "03-theory-lab.png"), fullPage: false });

    // 4. Recording, Timeline Editor and Export
    // Record in session to have a structured project
    await page.goto("/session");
    await page.getByTestId("btn-start-recording").click();
    await page.getByTestId("toggle-advanced").click();
    await page.getByTestId("fixture").click();
    await page.waitForTimeout(600);
    await page.getByTestId("btn-stop-recording").click();

    // Open in editor
    await expect(page.getByTestId("link-open-editor")).toBeVisible();
    await page.getByTestId("link-open-editor").click();

    await expect(page.getByTestId("timeline-editor")).toBeVisible();
    await page.getByTestId("btn-add-note").click();
    await page.getByTestId("btn-quantize").click();
    await page.getByTestId("btn-regen-chords").click();

    await page.screenshot({ path: path.join(demoDir, "04-timeline-editor.png"), fullPage: false });

    // 5. Open Export Modal
    await page.getByTestId("btn-editor-export").click();
    await expect(page.getByTestId("export-modal")).toBeVisible();
    await expect(page.getByTestId("radio-format-wav")).toBeVisible();
    await expect(page.getByTestId("radio-format-midi")).toBeVisible();

    await page.screenshot({ path: path.join(demoDir, "05-export-modal.png"), fullPage: false });

    expect(errors).toEqual([]);
  });
});
