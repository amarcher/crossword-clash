import type { CellState, Puzzle } from "../types/puzzle";
import { getSolveHistoryState, isRecordedFinish } from "./solveHistory";
import { groupFinishSeconds } from "./groupFinish";
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
 * Whether this player has finished the puzzle before in any way: a timed solve,
 * or a room on a shared grid (kept in the account's history with no time, and
 * on the device that played). A solve after any of them is made knowing the
 * answers, so it never goes on the day's leaderboard.
 */
export function playedBefore(key: string): boolean {
  if (solvedSeconds(key) !== null || groupFinishSeconds(key) !== null) return true;
  const history = getSolveHistoryState();
  return !!history?.rows?.some((row) => row.puzzle_key === key && isRecordedFinish(row));
}

/**
 * Finished in a room on a shared grid and never solved alone: the account's
 * history keeps such a finish with no time, and the device that played keeps
 * the room's. The puzzle opens on that room's result (roomResult.ts).
 */
export function playedAsGroup(key: string): boolean {
  if (solvedSeconds(key) !== null) return false;
  if (groupFinishSeconds(key) !== null) return true;
  const history = getSolveHistoryState();
  return !!history?.rows?.some((row) => row.puzzle_key === key && row.seconds === null && (row.mode === "versus" || row.mode === "coop"));
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
