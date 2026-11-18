/**
 * A recorded solve as the grid draws it part-way through a replay: its
 * letters, or the squares it has filled as the corner mark a live race draws.
 */
import { ghostAt, WRONG_LETTER, type TraceEvent } from "./race";
import type { CellState } from "../types/puzzle";

interface Recorded {
  color: string;
  seconds: number;
  events: TraceEvent[];
}

/**
 * Where a solve is `ms` into the replay. Its time is in whole seconds and its
 * last letter went in a fraction of a second after that, so once its clock
 * has stopped the solve is shown whole: the replay used to end one square
 * short of a finished grid (Andrew, 2026-11-16).
 */
const solveAt = (solve: Recorded, ms: number) => ghostAt(solve, ms >= solve.seconds * 1000 ? Infinity : ms);

/** The letters a solve shows `ms` into it, in the solve's colour (a wrong one rebuilt from a share code as checked-wrong). */
export function cellsAt(solve: Recorded, ms: number, width: number): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const [cell, letter] of solveAt(solve, ms).filled) {
    if (typeof letter !== "string") continue;
    out[`${Math.floor(cell / width)},${cell % width}`] = letter === WRONG_LETTER ? { letter, correct: false, checked: "wrong" } : { letter, correct: true, playerId: "replay" };
  }
  return out;
}

/** The squares a solve has filled `ms` into it, as the grid's dot map (cell key → colour). */
export function dotsAt(solve: Recorded, ms: number, width: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const cell of solveAt(solve, ms).filled.keys()) out.set(`${Math.floor(cell / width)},${cell % width}`, solve.color);
  return out;
}
