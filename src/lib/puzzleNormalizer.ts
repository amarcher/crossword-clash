import type { Puzzle, PuzzleCell, PuzzleClue, Direction } from "../types/puzzle";
import { computeCellNumbers } from "./gridUtils";

type ParserClues = {
  across: { number: number; text: string }[];
  down: { number: number; text: string }[];
};

/**
 * Convert the output of @xwordly/xword-parser into our internal Puzzle type.
 *
 * When `filename` ends with ".puz", clue texts are re-assigned using grid-based
 * interleaved ordering to work around a bug in the parser's clue splitting.
 */
export function normalizePuzzle(
  parsed: {
    title?: string;
    author?: string;
    grid: {
      width: number;
      height: number;
      cells: { solution?: string; number?: number; isBlack: boolean; isCircled?: boolean }[][];
    };
    clues: ParserClues;
  },
  filename?: string,
): Puzzle {
  const { grid } = parsed;
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

  // Fix .puz clue text assignment: the parser reads the interleaved clue list
  // from the file but incorrectly splits it (all across first, then all down).
  // Re-assign texts by walking the grid in interleaved order.
  const clues =
    filename?.toLowerCase().endsWith(".puz")
      ? fixPuzClueOrder(parsed.clues, cells, width, height)
      : parsed.clues;

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

/**
 * Fix the clue text assignment for .puz files.
 *
 * The .puz binary format stores clue strings in interleaved order: for each
 * numbered cell (L-R, T-B), the across clue text (if it starts an across word)
 * followed by the down clue text (if it starts a down word).
 *
 * The parser bug reads this interleaved list but splits it incorrectly — it
 * assigns the first N texts to across and the remaining M texts to down,
 * rather than distributing them based on grid analysis.
 *
 * Fix: concatenate the parser's across + down texts (which reconstructs the
 * original interleaved list), then walk the grid to assign each text to the
 * correct direction and number.
 */
function fixPuzClueOrder(
  clues: ParserClues,
  cells: PuzzleCell[][],
  width: number,
  height: number,
): ParserClues {
  const allTexts = [
    ...clues.across.map((c) => c.text),
    ...clues.down.map((c) => c.text),
  ];

  const across: { number: number; text: string }[] = [];
  const down: { number: number; text: string }[] = [];
  let ti = 0;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell = cells[r][c];
      if (cell.solution === null || cell.number == null) continue;

      const startsAcross =
        (c === 0 || cells[r][c - 1].solution === null) &&
        c + 1 < width &&
        cells[r][c + 1].solution !== null;
      const startsDown =
        (r === 0 || cells[r - 1][c].solution === null) &&
        r + 1 < height &&
        cells[r + 1][c].solution !== null;

      if (startsAcross && ti < allTexts.length) {
        across.push({ number: cell.number, text: allTexts[ti++] });
      }
      if (startsDown && ti < allTexts.length) {
        down.push({ number: cell.number, text: allTexts[ti++] });
      }
    }
  }

  return { across, down };
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
