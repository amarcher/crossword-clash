import type { CellState, Puzzle } from "../types/puzzle";
import { getSolveHistoryState } from "./solveHistory";
import { loadSoloStats } from "./soloStats";

/**
 * A puzzle this solver has finished, as the app can know it without a hook:
 * the account's solve history when it is loaded, else this device's stats.
 * The same two sources as `useBestTimes()`, so a tile and the screen it opens
 * agree. Returns the best time in seconds, or null when no finish is recorded
 * (an assisted finish and a shared-grid race record none).
 */
export function solvedSeconds(key: string): number | null {
  const history = getSolveHistoryState();
  const fromAccount = history?.status === "ready" ? history.summary.bestTimes[key] : undefined;
  const seconds = fromAccount ?? loadSoloStats().bestTimes[key];
  return typeof seconds === "number" && Number.isFinite(seconds) ? seconds : null;
}

/**
 * The grid of a solved puzzle: every white square with its solution. A finish
 * deletes the attempt's cells (soloProgress.ts keeps only unfinished puzzles),
 * and the letters of a solved crossword are its solution, so the filled grid
 * is rebuilt from the puzzle instead of being stored a second time.
 */
export function solutionCells(puzzle: Puzzle): Record<string, CellState> {
  const cells: Record<string, CellState> = {};
  for (const row of puzzle.cells) {
    for (const cell of row) {
      if (cell.solution !== null) cells[`${cell.row},${cell.col}`] = { letter: cell.solution, correct: true };
    }
  }
  return cells;
}
