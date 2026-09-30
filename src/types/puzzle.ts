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
 * Where a puzzle came from, when it matters after import. Only the NYT
 * bookmarklet is tagged today: it drives the "same time tomorrow" hook and
 * the NYT streak. Absent for file uploads, classics, dailies and samples.
 */
export type PuzzleOrigin = "nyt-bookmarklet";

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
}

export interface CellCoord {
  row: number;
  col: number;
}
