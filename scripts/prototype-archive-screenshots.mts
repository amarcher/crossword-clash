/**
 * PROTOTYPE — throwaway. Phone-width screenshots of the archive variants.
 *   pnpm exec vite --port 5290 &   then   node --experimental-strip-types scripts/prototype-archive-screenshots.mts
 * Writes docs/puzzle-archive/variant-<key>.png (viewport) and -full.png (whole page).
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const base = process.env.PROTO_BASE ?? "http://localhost:5290";
const out = "docs/puzzle-archive";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["iPhone 14"], locale: "en-US", timezoneId: "America/Los_Angeles" });
const page = await context.newPage();
for (const key of ["A", "B", "C"]) {
  await page.goto(`${base}/prototype/archive?variant=${key}&fake=1`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-archive-ready]", { timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/variant-${key}.png` });
  await page.screenshot({ path: `${out}/variant-${key}-full.png`, fullPage: true });
  console.log(`variant ${key} done`);
}
await page.goto(`${base}/prototype/archive?variant=B`, { waitUntil: "networkidle" });
await page.waitForSelector("[data-archive-ready]", { timeout: 20_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/variant-B-real-history.png` });
await browser.close();
