/**
 * Opt-in real-voice E2E: a cappella WAV as the Chromium fake microphone,
 * through the real hum-first flow. Skipped unless ACAPELLA_WAV is set.
 *
 *   ACAPELLA_WAV=/abs/voice.wav ACAPELLA_SEC=40 npx playwright test e2e/acapella-real.spec.ts
 *
 * Counts how the band is voiced: AudioBufferSourceNode starts = recorded
 * samples, OscillatorNode starts = synthesis.
 */
import { expect, test } from "@playwright/test";

const WAV = process.env.ACAPELLA_WAV;
const SEC = Number(process.env.ACAPELLA_SEC ?? 30);

test.skip(!WAV, "set ACAPELLA_WAV to run");
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${WAV}%noloop`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
  permissions: ["microphone"],
});

test("a cappella voice → hum-first band", async ({ page }) => {
  test.setTimeout((SEC + 90) * 1000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(() => {
    const stats = { buffer: 0, osc: 0, bufferAfterPlay: 0, oscAfterPlay: 0, playing: false };
    (window as unknown as { __audio: typeof stats }).__audio = stats;
    const proto = BaseAudioContext.prototype;
    const mkBuf = proto.createBufferSource;
    const mkOsc = proto.createOscillator;
    proto.createBufferSource = function () {
      stats.buffer++;
      if (stats.playing) stats.bufferAfterPlay++;
      return mkBuf.call(this);
    };
    proto.createOscillator = function () {
      stats.osc++;
      if (stats.playing) stats.oscAfterPlay++;
      return mkOsc.call(this);
    };
  });
  await page.goto("/session");
  await expect(page.getByText("Pronto").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("hum-start").click();
  const timeline: string[] = [];
  for (let t = 0; t < SEC; t += 5) {
    await page.waitForTimeout(5000);
    const key = await page.getByTestId("key").textContent();
    const status = await page.getByTestId("hum-status").textContent();
    timeline.push(`${t + 5}s key=${key} | ${status?.slice(0, 60)}`);
  }
  await page.screenshot({ path: "test-results/acapella-captured.png", fullPage: true });
  await page.evaluate(() => { (window as unknown as { __audio: { playing: boolean } }).__audio.playing = true; });
  await page.getByTestId("hum-play").click();
  await page.waitForTimeout(15_000);
  const cleanup = await page.getByTestId("hum-cleanup").textContent().catch(() => null);
  const stats = await page.evaluate(() => (window as unknown as { __audio: unknown }).__audio);
  await page.screenshot({ path: "test-results/acapella-playing.png", fullPage: true });
  console.log(JSON.stringify({ timeline, cleanup, stats, errors }, null, 1));
  expect(errors).toEqual([]);
  expect((stats as { bufferAfterPlay: number }).bufferAfterPlay).toBeGreaterThan(0);
});
