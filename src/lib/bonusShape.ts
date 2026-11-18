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

/** The grid shape a puzzle's card shows (what `pnpm bonus:add` stores). */
export function blocksOf(puzzle: Pick<Puzzle, "cells">): string {
  return puzzle.cells.map((row) => row.map((c) => (c.solution === null ? "#" : ".")).join("")).join("");
}
