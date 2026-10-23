/**
 * Content identity for a puzzle row on the server.
 *
 * `uploadPuzzle` (puzzleService.ts) stores one `puzzles` row per distinct
 * puzzle by looking it up under this hash before inserting. The hash covers
 * exactly what the row stores — title, author, size, grid and clues — so the
 * same daily, classic or deep-linked puzzle maps to the same row however it
 * arrived, and a different clue set is a different puzzle. It is a SHA-256 of
 * a canonical JSON form (object keys sorted, `undefined` dropped), so the key
 * order a parser or the transfer format happens to produce cannot split one
 * puzzle into two rows.
 *
 * Pure apart from `crypto.subtle`, which browsers, Node 20+ and jsdom share.
 */
import type { Puzzle } from "../types/puzzle";

/** The fields a `puzzles` row stores, in the shape it stores them. */
export type PuzzleContent = Pick<Puzzle, "title" | "author" | "width" | "height" | "cells" | "clues">;

/**
 * JSON with object keys in sorted order at every depth. Arrays keep their
 * order (grid rows and clue lists are ordered); `undefined` values are dropped
 * like JSON.stringify does.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/** The canonical text that is hashed: only the stored fields, in a fixed order. */
export function puzzleContentText(puzzle: PuzzleContent): string {
  return canonicalJson({
    title: puzzle.title,
    author: puzzle.author,
    width: puzzle.width,
    height: puzzle.height,
    grid: puzzle.cells,
    clues: puzzle.clues,
  });
}

/** Lower-case hex SHA-256 of {@link puzzleContentText}. */
export async function puzzleContentHash(puzzle: PuzzleContent): Promise<string> {
  const bytes = new TextEncoder().encode(puzzleContentText(puzzle));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
