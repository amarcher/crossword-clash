/** Pure helpers for a bonus card's grid shape (bonus.ts), with no app imports so scripts can use them. */
import type { Puzzle, PuzzleCell } from "../types/puzzle";

/** A card's grid shape as a puzzle with no answers, for MiniGridThumb. */
export function shapePuzzle(card: { title: string; width: number; height: number; blocks: string }): Puzzle {
  const cells: PuzzleCell[][] = [];
  for (let row = 0; row < card.height; row++) {
    const line: PuzzleCell[] = [];
    for (let col = 0; col < card.width; col++) line.push({ row, col, solution: card.blocks[row * card.width + col] === "#" ? null : "" });
    cells.push(line);
  }
  return { title: card.title, author: "", width: card.width, height: card.height, cells, clues: [] };
}

/**
 * How many clues a card's grid has: every run of two or more white squares,
 * across and down. The card carries the shape, not the clues, and the menu
 * line reads "11×11 · 40 clues" like the dailies' (Andrew, 2026-11-24).
 */
export function clueCount(card: { width: number; height: number; blocks: string }): number {
  const white = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < card.height && col < card.width && card.blocks[row * card.width + col] !== "#";
  let count = 0;
  for (let row = 0; row < card.height; row++)
    for (let col = 0; col < card.width; col++) {
      if (!white(row, col)) continue;
      if (!white(row, col - 1) && white(row, col + 1)) count++;
      if (!white(row - 1, col) && white(row + 1, col)) count++;
    }
  return count;
}

/** The grid shape a puzzle's card shows (what `pnpm bonus:add` stores). */
export function blocksOf(puzzle: Pick<Puzzle, "cells">): string {
  return puzzle.cells.map((row) => row.map((c) => (c.solution === null ? "#" : ".")).join("")).join("");
}
