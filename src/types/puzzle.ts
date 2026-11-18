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
 * (docs/community-puzzles-spec.md) records its solves under its own source;
 * a bonus (bonus.ts) is Plus only, so its share link never carries it
 * (the link names its day: `/bonus/:day`, bonusLink.ts).
 * Absent for file uploads, dailies and samples.
 */
export type PuzzleOrigin = "nyt-bookmarklet" | "community" | "bonus";

/**
 * Which shared puzzle this is, where the site can name it by link: a day's
 * daily (`/daily/:day/:slot`) or a community puzzle (`/puzzles/:shortId`).
 * Set where the puzzle is fetched (dailyFeed.fetchDailyForDay,
 * communityPuzzles.toPlayablePuzzle). Absent for imports, which have no such link.
 */
export type PageRef = { day: string; slot: "mini" | "midi" | "large" } | { shortId: string };

/**
 * A day's Daily Plus (`/bonus/:day`, BonusLinkScreen). Never on `Puzzle.ref`
 * (room settings carry that, and a bonus is not a room's to name): the solo
 * screen makes it from `Puzzle.bonusDay`, and the link's challenge carries
 * it. Its key is not `day`, so every `"day" in ref` still means a daily.
 */
export type BonusRef = { bonusDay: string };

/**
 * Anything a share link can name: what a finish's share, friend invite,
 * replay, shared race and race reply point at. A Daily Plus link works as the
 * others do, with one rule (Andrew, 2026-11-18): a viewer without Plus only
 * ever sees squares filling, and "Let me solve it" opens the paywall.
 */
export type PuzzleRef = PageRef | BonusRef;

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
  ref?: PageRef;
  /** A bonus puzzle's day (bonus.ts): which bonus board its finish belongs on, and the day its share link names. */
  bonusDay?: string;
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
  /**
   * Set by CHECK_CELLS on a letter that is not the solution (solo play with
   * Autocheck off, see soloSettings.ts); dropped the moment the square is
   * retyped or erased, since a changed cell is a new CellState.
   */
  checked?: "wrong";
  /**
   * Written by REVEAL_CELL: the solution, locked against typing and erasing.
   * A finish with a revealed square counts as solved but "assisted" — no best
   * time, no streak, no leaderboard time.
   */
  revealed?: boolean;
}

export interface CellCoord {
  row: number;
  col: number;
}
