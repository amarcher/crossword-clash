import { expect, test } from "@playwright/test";
import { gridCell } from "./helpers";

interface StoredCell {
  row: number;
  col: number;
  solution: string | null;
}

// Runs with or without Supabase env vars — the daily mini is bundled data.
test("solo: complete today's mini", async ({ page }) => {
  await page.goto("/menu");
  await page.getByRole("button", { name: /Play Today's Mini/i }).click();
  await expect(page).toHaveURL(/\/solo\/play/);
  await expect(page.getByRole("grid").first()).toBeVisible();

  // Solo persists { puzzle, playerCells } to localStorage on every change.
  const cells = await page.waitForFunction(() => {
    const raw = localStorage.getItem("crossword-clash-solo");
    return raw ? (JSON.parse(raw).puzzle.cells as StoredCell[][]) : null;
  });
  const grid = (await cells.jsonValue()) as StoredCell[][];
  const white = grid.flat().filter((c) => c.solution);
  expect(white.length).toBeGreaterThan(0);

  // Click each white cell and type its answer. Deterministic regardless of
  // where the smart cursor would have advanced to.
  for (const cell of white) {
    await gridCell(page, cell.row, cell.col).click();
    await page.keyboard.type(cell.solution!.charAt(0));
  }

  await expect(page.getByRole("dialog", { name: /Puzzle Complete/i })).toBeVisible();
});
