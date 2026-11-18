import { test, expect } from "@playwright/test";
import LZString from "lz-string";
import { puzzleToTransferFormat } from "../src/lib/puzzleNormalizer";
import { SAMPLE_PUZZLES } from "../src/lib/samplePuzzles";
import { gridCell } from "./helpers";

const imported = { ...SAMPLE_PUZZLES[0].puzzle, title: "Stage Combat — imported" };
const hash = "#puzzle=" + LZString.compressToEncodedURIComponent(JSON.stringify(puzzleToTransferFormat(imported)));

for (const width of [375, 1280]) {
  test(`pause, switch, offline resume and reload at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/${hash}`);
    await page.getByRole("button", { name: "Play solo", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const first = imported.cells.flat().find(cell => cell.solution)!;
    await gridCell(page, first.row, first.col).click();
    await page.keyboard.type(first.solution!);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
    await expect(page.getByRole("grid")).toHaveCount(0);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("crossword-clash-solo")!).playerCells);
    await page.keyboard.type("XYZ");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("crossword-clash-solo")!).playerCells)).toEqual(stored);
    await page.screenshot({ path: `docs/solo-pause/paused-${width}.png` });
    await page.getByRole("button", { name: "Save & exit" }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await page.reload();
    await expect(page.getByRole("region", { name: "Continue playing" })).toContainText(imported.title);
    await page.getByRole("region", { name: "Daily Mini" }).getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Save & exit" }).click();
    await page.getByRole("button", { name: "In progress (2)", exact: true }).click();
    await page.screenshot({ path: `docs/solo-pause/menu-${width}.png` });
    await context.setOffline(true);
    const row = page.getByRole("region", { name: "Continue playing" }).locator("div.border-t").filter({ hasText: imported.title });
    await row.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(gridCell(page, first.row, first.col)).toHaveAttribute("aria-label", new RegExp(`${first.solution}$`));
    await expect(page.getByRole("dialog", { name: "Paused" })).toHaveCount(0);
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(gridCell(page, first.row, first.col)).toHaveAttribute("aria-label", new RegExp(`${first.solution}$`));
    expect(errors).toEqual([]);
  });
}

test("hidden tab freezes the clock and returns paused; browser Back preserves work", async ({ page }) => {
  await page.goto(`/${hash}`);
  await page.getByRole("button", { name: "Play solo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(12_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  const clock = await page.getByRole("dialog").locator(".font-mono").textContent();
  await page.clock.fastForward(600_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("dialog").locator(".font-mono")).toHaveText(clock!);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/puzzle-ready/);
  await page.goForward();
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
});

test("failed storage keeps the grid in memory and retry restores Save & exit", async ({ page }) => {
  await page.goto(`/${hash}`);
  await page.getByRole("button", { name: "Play solo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original; } });
    Storage.prototype.setItem = function(key, value) {
      if (key.includes("solo")) throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("couldn’t save");
  await expect(page.getByRole("button", { name: "Save & exit" })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(page).toHaveURL(/\/menu$/);
});

test("a full save list requires explicit removal before starting a new puzzle", async ({ page }) => {
  await page.goto("/menu");
  await page.evaluate(puzzle => {
    const records = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`legacy-${i}`, {
      key: `legacy-${i}`, cells: {}, elapsedMs: i * 1000, filled: 0, total: 23,
      updatedAt: i, puzzle: { ...puzzle, title: `Saved puzzle ${i}` },
    }]));
    localStorage.setItem("crossword-clash:solo-progress", JSON.stringify(records));
  }, imported);
  await page.reload();
  await page.getByRole("region", { name: "Daily Mini" }).getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("30 unfinished puzzles");
  await expect(page).toHaveURL(/\/menu$/);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("crossword-clash:solo-progress")!)).length)).toBe(30);
  await page.getByRole("button", { name: "Remove Saved puzzle 29", exact: true }).click();
  await page.getByRole("button", { name: "Keep puzzle", exact: true }).click();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("crossword-clash:solo-progress")!)).length)).toBe(30);
  await page.getByRole("button", { name: "Remove Saved puzzle 29", exact: true }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("region", { name: "Daily Mini" }).getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("crossword-clash:solo-progress")!)).length)).toBe(30);
});

test("Spanish pause controls fit a 320px screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => localStorage.setItem("crossword-clash:language", "es"));
  await page.goto(`/${hash}`);
  await page.getByRole("button", { name: /Jugar solo/i }).click();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "En pausa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar y salir" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "docs/solo-pause/paused-es-320.png" });
});
