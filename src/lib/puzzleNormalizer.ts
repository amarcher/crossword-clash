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

  // Build cell grid, preserving parser-provided cell numbers
  const cells: PuzzleCell[][] = [];
  let hasParserNumbers = false;
  for (let r = 0; r < height; r++) {
    const row: PuzzleCell[] = [];
    for (let c = 0; c < width; c++) {
      const src = grid.cells[r][c];
      if (src.number != null && src.number > 0) hasParserNumbers = true;
      row.push({
        row: r,
        col: c,
        solution: src.isBlack ? null : (src.solution?.toUpperCase() ?? ""),
        number: src.number != null && src.number > 0 ? src.number : undefined,
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

  // Use parser-provided cell numbers when available (they match parser clue numbers).
  // Fall back to computing our own only when the parser didn't provide any.
  if (!hasParserNumbers) {
    const numbers = computeCellNumbers(puzzle);
    for (const [key, num] of numbers) {
      const [r, c] = key.split(",").map(Number);
      puzzle.cells[r][c].number = num;
    }
  }

  // Build clues with answers reconstructed from the grid
  function buildClues(
    rawClues: { number: number; text: string }[],
    direction: Direction,
  ): PuzzleClue[] {
    return rawClues.map((rc) => {
      // Find the cell with this number
      const startCoord = findCellByNumber(puzzle, rc.number);
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
): { row: number; col: number } | null {
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (puzzle.cells[r][c].number === number && puzzle.cells[r][c].solution !== null) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}
