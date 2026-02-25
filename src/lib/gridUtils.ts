import type {
  Puzzle,
  PuzzleCell,
  PuzzleClue,
  CellCoord,
  CellState,
  Direction,
} from "../types/puzzle";

export function getCellAt(
  puzzle: Puzzle,
  row: number,
  col: number,
): PuzzleCell | null {
  if (row < 0 || row >= puzzle.height || col < 0 || col >= puzzle.width) {
    return null;
  }
  return puzzle.cells[row][col];
}

export function isBlack(puzzle: Puzzle, row: number, col: number): boolean {
  const cell = getCellAt(puzzle, row, col);
  return cell === null || cell.solution === null;
}

/** Get all cells belonging to the word at (row, col) in the given direction */
export function getWordCells(
  puzzle: Puzzle,
  row: number,
  col: number,
  direction: Direction,
): CellCoord[] {
  if (isBlack(puzzle, row, col)) return [];

  const cells: CellCoord[] = [];
  let r = row;
  let c = col;

  // Walk backward to the start of the word
  if (direction === "across") {
    while (c > 0 && !isBlack(puzzle, r, c - 1)) c--;
    // Walk forward collecting cells
    while (c < puzzle.width && !isBlack(puzzle, r, c)) {
      cells.push({ row: r, col: c });
      c++;
    }
  } else {
    while (r > 0 && !isBlack(puzzle, r - 1, c)) r--;
    while (r < puzzle.height && !isBlack(puzzle, r, c)) {
      cells.push({ row: r, col: c });
      r++;
    }
  }

  return cells;
}

/** Get the clue for the word at (row, col) in the given direction */
export function getClueForCell(
  puzzle: Puzzle,
  row: number,
  col: number,
  direction: Direction,
): PuzzleClue | null {
  const wordCells = getWordCells(puzzle, row, col, direction);
  if (wordCells.length === 0) return null;

  const start = wordCells[0];
  return (
    puzzle.clues.find(
      (c) =>
        c.direction === direction && c.row === start.row && c.col === start.col,
    ) ?? null
  );
}

/** Get the next white cell in the given direction, or null if at the edge */
export function getNextCell(
  puzzle: Puzzle,
  row: number,
  col: number,
  direction: Direction,
): CellCoord | null {
  const dr = direction === "down" ? 1 : 0;
  const dc = direction === "across" ? 1 : 0;
  const nr = row + dr;
  const nc = col + dc;
  if (nr >= puzzle.height || nc >= puzzle.width) return null;
  if (isBlack(puzzle, nr, nc)) return null;
  return { row: nr, col: nc };
}

/** Get the previous white cell in the given direction, or null if at the edge */
export function getPrevCell(
  puzzle: Puzzle,
  row: number,
  col: number,
  direction: Direction,
): CellCoord | null {
  const dr = direction === "down" ? -1 : 0;
  const dc = direction === "across" ? -1 : 0;
  const nr = row + dr;
  const nc = col + dc;
  if (nr < 0 || nc < 0) return null;
  if (isBlack(puzzle, nr, nc)) return null;
  return { row: nr, col: nc };
}

/** Get the start cell of the next word (Tab behavior) */
export function getNextWordStart(
  puzzle: Puzzle,
  row: number,
  col: number,
  direction: Direction,
): { coord: CellCoord; direction: Direction } {
  const cluesInDirection = puzzle.clues
    .filter((c) => c.direction === direction)
    .sort((a, b) => a.number - b.number);

  const currentClue = getClueForCell(puzzle, row, col, direction);
  if (!currentClue) {
    // Fallback: return first clue
    const first = cluesInDirection[0] ?? puzzle.clues[0];
    return {
      coord: { row: first.row, col: first.col },
      direction: first.direction,
    };
  }

  const idx = cluesInDirection.findIndex(
    (c) => c.number === currentClue.number,
  );
  if (idx < cluesInDirection.length - 1) {
    const next = cluesInDirection[idx + 1];
    return { coord: { row: next.row, col: next.col }, direction };
  }

  // Wrap to other direction
  const otherDir: Direction = direction === "across" ? "down" : "across";
  const otherClues = puzzle.clues
    .filter((c) => c.direction === otherDir)
    .sort((a, b) => a.number - b.number);

  if (otherClues.length > 0) {
    const first = otherClues[0];
    return {
      coord: { row: first.row, col: first.col },
      direction: otherDir,
    };
  }

  // Wrap to first clue in same direction
  const first = cluesInDirection[0];
  return { coord: { row: first.row, col: first.col }, direction };
}

/** Get the start cell of the previous word (Shift+Tab behavior) */
export function getPrevWordStart(
  puzzle: Puzzle,
  row: number,
  col: number,
  direction: Direction,
): { coord: CellCoord; direction: Direction } {
  const cluesInDirection = puzzle.clues
    .filter((c) => c.direction === direction)
    .sort((a, b) => a.number - b.number);

  const currentClue = getClueForCell(puzzle, row, col, direction);
  if (!currentClue) {
    const last = cluesInDirection[cluesInDirection.length - 1] ?? puzzle.clues[0];
    return {
      coord: { row: last.row, col: last.col },
      direction: last.direction,
    };
  }

  const idx = cluesInDirection.findIndex(
    (c) => c.number === currentClue.number,
  );
  if (idx > 0) {
    const prev = cluesInDirection[idx - 1];
    return { coord: { row: prev.row, col: prev.col }, direction };
  }

  // Wrap to other direction
  const otherDir: Direction = direction === "across" ? "down" : "across";
  const otherClues = puzzle.clues
    .filter((c) => c.direction === otherDir)
    .sort((a, b) => a.number - b.number);

  if (otherClues.length > 0) {
    const last = otherClues[otherClues.length - 1];
    return {
      coord: { row: last.row, col: last.col },
      direction: otherDir,
    };
  }

  const last = cluesInDirection[cluesInDirection.length - 1];
  return { coord: { row: last.row, col: last.col }, direction };
}

/** Get the set of completed clue keys (e.g. "across-1", "down-3") */
export function getCompletedClues(
  puzzle: Puzzle,
  playerCells: Record<string, CellState>,
): Set<string> {
  const completed = new Set<string>();
  for (const clue of puzzle.clues) {
    const cells = getWordCells(puzzle, clue.row, clue.col, clue.direction);
    if (
      cells.length > 0 &&
      cells.every((c) => playerCells[`${c.row},${c.col}`]?.correct)
    ) {
      completed.add(`${clue.direction}-${clue.number}`);
    }
  }
  return completed;
}

/**
 * Like getCompletedClues, but also records which player completed each clue.
 * The "completing player" is the one who placed the last letter in the word.
 */
export function getCompletedCluesByPlayer(
  puzzle: Puzzle,
  playerCells: Record<string, CellState>,
): Map<string, { playerId: string }> {
  const completed = new Map<string, { playerId: string }>();
  for (const clue of puzzle.clues) {
    const cells = getWordCells(puzzle, clue.row, clue.col, clue.direction);
    if (cells.length === 0) continue;
    if (!cells.every((c) => playerCells[`${c.row},${c.col}`]?.correct)) continue;

    // Find the last cell that has a playerId (the one who "finished" the word)
    let lastPlayerId: string | undefined;
    for (const cell of cells) {
      const state = playerCells[`${cell.row},${cell.col}`];
      if (state?.playerId) {
        lastPlayerId = state.playerId;
      }
    }

    const key = `${clue.direction}-${clue.number}`;
    if (lastPlayerId) {
      completed.set(key, { playerId: lastPlayerId });
    } else {
      // Solo mode — no playerId, still mark as completed with empty string
      completed.set(key, { playerId: "" });
    }
  }
  return completed;
}

/**
 * Compute cell numbers for a puzzle grid.
 * A cell gets a number if it starts an across word or a down word.
 */
export function computeCellNumbers(puzzle: Puzzle): Map<string, number> {
  const numbers = new Map<string, number>();
  let num = 1;

  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (isBlack(puzzle, r, c)) continue;

      const startsAcross = (c === 0 || isBlack(puzzle, r, c - 1)) &&
        c + 1 < puzzle.width && !isBlack(puzzle, r, c + 1);
      const startsDown = (r === 0 || isBlack(puzzle, r - 1, c)) &&
        r + 1 < puzzle.height && !isBlack(puzzle, r + 1, c);

      if (startsAcross || startsDown) {
        numbers.set(`${r},${c}`, num);
        num++;
      }
    }
  }

  return numbers;
}
