import { describe, it, expect } from "vitest";
import { normalizePuzzle } from "./puzzleNormalizer";

/**
 * Minimal parser output representing a 3x3 puzzle:
 *   C A T
 *   A # O
 *   B E T
 */
function makeParserOutput() {
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
});
