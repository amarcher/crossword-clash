import type { Puzzle, PuzzleCell, PuzzleClue, Direction } from "../types/puzzle";
import { computeCellNumbers } from "./gridUtils";

/**
 * Convert the output of @xwordly/xword-parser into our internal Puzzle type.
 */
export function normalizePuzzle(parsed: {
  title?: string;
  author?: string;
  grid: {
    width: number;
    height: number;
    cells: { solution?: string; number?: number; isBlack: boolean; isCircled?: boolean }[][];
  };
  clues: {
    across: { number: number; text: string }[];
    down: { number: number; text: string }[];
  };
}): Puzzle {
  const { grid, clues } = parsed;
  const width = grid.width;
  const height = grid.height;

  // Build cell grid
  const cells: PuzzleCell[][] = [];
  for (let r = 0; r < height; r++) {
    const row: PuzzleCell[] = [];
    for (let c = 0; c < width; c++) {
      const src = grid.cells[r][c];
      row.push({
        row: r,
        col: c,
        solution: src.isBlack ? null : (src.solution?.toUpperCase() ?? ""),
        circled: src.isCircled,
      });
    }
    cells.push(row);
  }

  const puzzle: Puzzle = {
    title: parsed.title ?? "Untitled",
    author: parsed.author ?? "",
    width,
    height,
    cells,
    clues: [],
  };

  // Compute cell numbers
  const numbers = computeCellNumbers(puzzle);
  for (const [key, num] of numbers) {
    const [r, c] = key.split(",").map(Number);
    puzzle.cells[r][c].number = num;
  }

  // Build clues with answers reconstructed from the grid
  function buildClues(
    rawClues: { number: number; text: string }[],
    direction: Direction,
  ): PuzzleClue[] {
    return rawClues.map((rc) => {
      // Find the cell with this number
      const startCoord = findCellByNumber(puzzle, rc.number, direction);
      if (!startCoord) {
        return {
          direction,
          number: rc.number,
          text: rc.text,
          row: 0,
          col: 0,
          length: 0,
          answer: "",
        };
      }

      // Walk the grid to build the answer
      const answer: string[] = [];
      let r = startCoord.row;
      let c = startCoord.col;
      while (
        r < height &&
        c < width &&
        cells[r][c].solution !== null
      ) {
        answer.push(cells[r][c].solution!);
        if (direction === "across") c++;
        else r++;
      }

      return {
        direction,
        number: rc.number,
        text: rc.text,
        row: startCoord.row,
        col: startCoord.col,
        length: answer.length,
        answer: answer.join(""),
      };
    });
  }

  puzzle.clues = [
    ...buildClues(clues.across, "across"),
    ...buildClues(clues.down, "down"),
  ];

  return puzzle;
}

function findCellByNumber(
  puzzle: Puzzle,
  number: number,
  direction: Direction,
): { row: number; col: number } | null {
  // A cell starts an across word if it has a number and
  // is at the left edge or preceded by a black cell
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      const cell = puzzle.cells[r][c];
      if (cell.number !== number) continue;
      if (cell.solution === null) continue;

      if (direction === "across") {
        const leftBlack = c === 0 || puzzle.cells[r][c - 1].solution === null;
        const hasRight = c + 1 < puzzle.width && puzzle.cells[r][c + 1].solution !== null;
        if (leftBlack && hasRight) return { row: r, col: c };
      } else {
        const topBlack = r === 0 || puzzle.cells[r - 1][c].solution === null;
        const hasBelow = r + 1 < puzzle.height && puzzle.cells[r + 1][c].solution !== null;
        if (topBlack && hasBelow) return { row: r, col: c };
      }
    }
  }
  // Fallback: just return any cell with this number
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (puzzle.cells[r][c].number === number && puzzle.cells[r][c].solution !== null) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}
