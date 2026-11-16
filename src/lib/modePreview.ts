/**
 * The little looping board that shows how a game mode plays (ModePreview.tsx):
 * a 4×4 word square filled in by two players, "you" (0) and a friend (1).
 *
 * - versus / coop: one shared grid. You fill across words left to right from
 *   the top row; the friend fills down words top to bottom from the right-hand
 *   column. Every word goes in first letter first (Andrew, 2026-11-16: the
 *   friend used to run backwards from the last square), and each square keeps
 *   the colour of whoever placed it.
 * - async (time trial) / ghost: your own copy. You fill it in reading order;
 *   the friend works on theirs at a different pace, live or from a recorded
 *   solve. Their filled squares show on your grid as a dot (Cell.tsx).
 *
 * Pure: a frame is a function of the mode and the step. Tested in
 * modePreview.test.ts.
 */

import type { RaceMode } from "../types/game";

export type PreviewMode = RaceMode | "ghost";

/** A word square, so every row and column reads as a word. */
export const PREVIEW_ROWS = ["CARD", "AREA", "REAR", "DART"] as const;
export const PREVIEW_SIZE = PREVIEW_ROWS.length;
export const PREVIEW_CELLS = PREVIEW_SIZE * PREVIEW_SIZE;
/** Steps the finished board is held for before the loop starts over. */
export const PREVIEW_HOLD = 6;
export const PREVIEW_LOOP = PREVIEW_CELLS + PREVIEW_HOLD;
/** The step a still picture uses (reduced motion): far enough in to show both players. */
export const PREVIEW_STILL = 10;

/** Whose turn each step of a shared grid is: you get nine squares, the friend seven. */
const TURNS = "ABAABABBAABABAAB";
/** How fast the friend fills their own copy next to yours. */
const OTHER_PACE = 0.75;

export interface PreviewCell {
  /** The solution letter, shown once the square is filled on this grid. */
  letter: string;
  /** Who placed it here: 0 you, 1 the friend, null while empty. */
  by: 0 | 1 | null;
  /** Own-copy modes: the friend has filled this square on their grid. */
  dot: boolean;
}

export interface PreviewFrame {
  cells: PreviewCell[];
  /** Squares each player has filled: [you, friend]. */
  counts: [number, number];
  /** You have finished your grid (or the shared grid is full). */
  done: boolean;
}

const readingOrder = Array.from({ length: PREVIEW_CELLS }, (_, i) => i);
/** Column by column: the friend's order on their own copy, so their dots do not trail your letters. */
const columnOrder = readingOrder.map((i) => (i % PREVIEW_SIZE) * PREVIEW_SIZE + Math.floor(i / PREVIEW_SIZE));
/** Down each column from the right-hand one: the friend's order on a shared grid, away from your first row. */
const downFromRight = readingOrder.map((i) => (i % PREVIEW_SIZE) * PREVIEW_SIZE + (PREVIEW_SIZE - 1 - Math.floor(i / PREVIEW_SIZE)));

function letterAt(i: number): string {
  return PREVIEW_ROWS[Math.floor(i / PREVIEW_SIZE)][i % PREVIEW_SIZE];
}

/** The board at `step` (any integer; it wraps at PREVIEW_LOOP). */
export function modePreviewFrame(mode: PreviewMode, step: number): PreviewFrame {
  const s = Math.min(PREVIEW_CELLS, ((step % PREVIEW_LOOP) + PREVIEW_LOOP) % PREVIEW_LOOP);
  const by: (0 | 1 | null)[] = new Array(PREVIEW_CELLS).fill(null);
  const dots = new Set<number>();

  if (mode === "versus" || mode === "coop") {
    for (let t = 0; t < s; t++) {
      const who = TURNS[t] === "A" ? 0 : 1;
      // You write across, the friend writes down; a square the other got to first is skipped.
      const order = who === 0 ? readingOrder : downFromRight;
      const next = order.find((i) => by[i] === null);
      if (next !== undefined) by[next] = who;
    }
  } else {
    for (let t = 0; t < s; t++) by[readingOrder[t]] = 0;
    const theirs = Math.min(PREVIEW_CELLS, Math.floor(s * OTHER_PACE));
    for (let t = 0; t < theirs; t++) dots.add(columnOrder[t]);
  }

  const shared = mode === "versus" || mode === "coop";
  const mine = by.filter((b) => b === 0).length;
  return {
    cells: by.map((b, i) => ({ letter: letterAt(i), by: b, dot: dots.has(i) })),
    counts: [mine, shared ? by.filter((b) => b === 1).length : dots.size],
    done: s >= PREVIEW_CELLS,
  };
}
