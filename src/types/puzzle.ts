export type Direction = "across" | "down";

export interface PuzzleCell {
  row: number;
  col: number;
  /** null = black cell */
  solution: string | null;
  /** Clue number displayed in the cell (if any) */
  number?: number;
  /** Whether the cell is circled (cosmetic) */
  circled?: boolean;
}

export interface PuzzleClue {
  direction: Direction;
  number: number;
  text: string;
  row: number;
  col: number;
  length: number;
  answer: string;
}

/**
 * Where a puzzle came from, when it matters after import. The NYT bookmarklet
 * drives the "same time tomorrow" hook and the NYT streak; a community puzzle
 * (docs/community-puzzles-spec.md) records its solves under its own source.
 * Absent for file uploads, dailies and samples.
 */
export type PuzzleOrigin = "nyt-bookmarklet" | "community";

export interface Puzzle {
  /** Provenance for subscriber-directed imports; contains no account or session data. */
  source?: { provider: "nyt"; date: string; kind: "daily" | "mini"; url: string };
  title: string;
  author: string;
  width: number;
  height: number;
  cells: PuzzleCell[][];
  clues: PuzzleClue[];
  origin?: PuzzleOrigin;
}

export interface CellState {
  letter: string;
  correct: boolean;
  /** Player who claimed this cell */
  playerId?: string;
  /**
   * When the cell was filled, in wall-clock ms (`Date.now()`), stamped by
   * INPUT_LETTER and REMOTE_CELL_CLAIM. Hydrated cells keep whatever was
   * saved, so cells from before this field exist have none. The share block
   * reads the relative order and spread, never the absolute time.
   */
  at?: number;
}

export interface CellCoord {
  row: number;
  col: number;
}
