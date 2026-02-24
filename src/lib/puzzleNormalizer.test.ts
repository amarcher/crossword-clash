import { describe, it, expect } from "vitest";
import { normalizePuzzle } from "./puzzleNormalizer";

/**
 * Minimal parser output representing a 3x3 puzzle:
 *   C A T
 *   A # O
 *   B E T
 */
type ParserCell = { solution?: string; number?: number; isBlack: boolean };

function makeParserOutput(): {
  title: string;
  author: string;
  grid: { width: number; height: number; cells: ParserCell[][] };
  clues: { across: { number: number; text: string }[]; down: { number: number; text: string }[] };
} {
  return {
    title: "Test Puzzle",
    author: "Test Author",
    grid: {
      width: 3,
      height: 3,
      cells: [
        [
          { solution: "C", isBlack: false },
          { solution: "A", isBlack: false },
          { solution: "T", isBlack: false },
        ],
        [
          { solution: "A", isBlack: false },
          { isBlack: true },
          { solution: "O", isBlack: false },
        ],
        [
          { solution: "B", isBlack: false },
          { solution: "E", isBlack: false },
          { solution: "T", isBlack: false },
        ],
      ],
    },
    clues: {
      across: [
        { number: 1, text: "Feline" },
        { number: 3, text: "Wager" },
      ],
      down: [
        { number: 1, text: "Taxi" },
        { number: 2, text: "Digit" },
      ],
    },
  };
}

describe("normalizePuzzle", () => {
  it("sets title and author from parser output", () => {
    const puzzle = normalizePuzzle(makeParserOutput());
    expect(puzzle.title).toBe("Test Puzzle");
    expect(puzzle.author).toBe("Test Author");
  });

  it("defaults title to 'Untitled' when missing", () => {
    const input = makeParserOutput();
    delete (input as Record<string, unknown>).title;
    const puzzle = normalizePuzzle(input);
    expect(puzzle.title).toBe("Untitled");
  });

  it("sets grid dimensions", () => {
    const puzzle = normalizePuzzle(makeParserOutput());
    expect(puzzle.width).toBe(3);
    expect(puzzle.height).toBe(3);
  });

  it("converts cells with uppercase solutions", () => {
    const input = makeParserOutput();
    input.grid.cells[0][0].solution = "c"; // lowercase
    const puzzle = normalizePuzzle(input);
    expect(puzzle.cells[0][0].solution).toBe("C");
  });

  it("marks black cells with null solution", () => {
    const puzzle = normalizePuzzle(makeParserOutput());
    expect(puzzle.cells[1][1].solution).toBeNull();
  });

  it("assigns cell numbers to word starts", () => {
    const puzzle = normalizePuzzle(makeParserOutput());
    expect(puzzle.cells[0][0].number).toBe(1); // 1-Across / 1-Down
    expect(puzzle.cells[0][2].number).toBe(2); // 2-Down
    expect(puzzle.cells[2][0].number).toBe(3); // 3-Across
    expect(puzzle.cells[0][1].number).toBeUndefined(); // mid-word
  });

  it("builds across clues with correct positions and answers", () => {
    const puzzle = normalizePuzzle(makeParserOutput());
    const acrossClues = puzzle.clues.filter((c) => c.direction === "across");
    expect(acrossClues).toHaveLength(2);

    const clue1 = acrossClues.find((c) => c.number === 1)!;
    expect(clue1.row).toBe(0);
    expect(clue1.col).toBe(0);
    expect(clue1.length).toBe(3);
    expect(clue1.answer).toBe("CAT");

    const clue3 = acrossClues.find((c) => c.number === 3)!;
    expect(clue3.row).toBe(2);
    expect(clue3.col).toBe(0);
    expect(clue3.answer).toBe("BET");
  });

  it("builds down clues with correct positions and answers", () => {
    const puzzle = normalizePuzzle(makeParserOutput());
    const downClues = puzzle.clues.filter((c) => c.direction === "down");
    expect(downClues).toHaveLength(2);

    const clue1 = downClues.find((c) => c.number === 1)!;
    expect(clue1.row).toBe(0);
    expect(clue1.col).toBe(0);
    expect(clue1.answer).toBe("CAB");

    const clue2 = downClues.find((c) => c.number === 2)!;
    expect(clue2.row).toBe(0);
    expect(clue2.col).toBe(2);
    expect(clue2.answer).toBe("TOT");
  });

  it("sets row and col on each cell", () => {
    const puzzle = normalizePuzzle(makeParserOutput());
    expect(puzzle.cells[2][1].row).toBe(2);
    expect(puzzle.cells[2][1].col).toBe(1);
  });

  it("uses parser-provided cell numbers when available", () => {
    const input = makeParserOutput();
    // Assign non-standard numbers that differ from what computeCellNumbers would produce
    input.grid.cells[0][0].number = 10;
    input.grid.cells[0][2].number = 20;
    input.grid.cells[2][0].number = 30;
    input.clues = {
      across: [
        { number: 10, text: "Feline" },
        { number: 30, text: "Wager" },
      ],
      down: [
        { number: 10, text: "Taxi" },
        { number: 20, text: "Digit" },
      ],
    };

    const puzzle = normalizePuzzle(input);
    expect(puzzle.cells[0][0].number).toBe(10);
    expect(puzzle.cells[0][2].number).toBe(20);
    expect(puzzle.cells[2][0].number).toBe(30);
    // Mid-word cells should have no number
    expect(puzzle.cells[0][1].number).toBeUndefined();
    expect(puzzle.cells[1][0].number).toBeUndefined();
  });

  it("maps clues correctly when parser provides cell numbers", () => {
    const input = makeParserOutput();
    input.grid.cells[0][0].number = 10;
    input.grid.cells[0][2].number = 20;
    input.grid.cells[2][0].number = 30;
    input.clues = {
      across: [
        { number: 10, text: "Feline" },
        { number: 30, text: "Wager" },
      ],
      down: [
        { number: 10, text: "Taxi" },
        { number: 20, text: "Digit" },
      ],
    };

    const puzzle = normalizePuzzle(input);

    const across10 = puzzle.clues.find((c) => c.direction === "across" && c.number === 10)!;
    expect(across10.row).toBe(0);
    expect(across10.col).toBe(0);
    expect(across10.answer).toBe("CAT");

    const across30 = puzzle.clues.find((c) => c.direction === "across" && c.number === 30)!;
    expect(across30.row).toBe(2);
    expect(across30.col).toBe(0);
    expect(across30.answer).toBe("BET");

    const down10 = puzzle.clues.find((c) => c.direction === "down" && c.number === 10)!;
    expect(down10.row).toBe(0);
    expect(down10.col).toBe(0);
    expect(down10.answer).toBe("CAB");

    const down20 = puzzle.clues.find((c) => c.direction === "down" && c.number === 20)!;
    expect(down20.row).toBe(0);
    expect(down20.col).toBe(2);
    expect(down20.answer).toBe("TOT");
  });

  it("falls back to computeCellNumbers when parser has no numbers", () => {
    const input = makeParserOutput();
    // Explicitly verify no cells have numbers set
    for (const row of input.grid.cells) {
      for (const cell of row) {
        expect(cell.number).toBeUndefined();
      }
    }

    const puzzle = normalizePuzzle(input);
    // computeCellNumbers assigns standard numbering: 1, 2, 3
    expect(puzzle.cells[0][0].number).toBe(1);
    expect(puzzle.cells[0][2].number).toBe(2);
    expect(puzzle.cells[2][0].number).toBe(3);
  });
});
