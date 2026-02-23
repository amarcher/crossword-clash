import { describe, it, expect } from "vitest";
import {
  isBlack,
  getWordCells,
  getNextCell,
  getPrevCell,
  computeCellNumbers,
} from "./gridUtils";
import type { Puzzle } from "../types/puzzle";

/**
 * 3x3 test puzzle:
 *   C A T
 *   A # O
 *   B E T
 */
function makeTestPuzzle(): Puzzle {
  return {
    title: "Test",
    author: "Test",
    width: 3,
    height: 3,
    cells: [
      [
        { row: 0, col: 0, solution: "C", number: 1 },
        { row: 0, col: 1, solution: "A" },
        { row: 0, col: 2, solution: "T", number: 2 },
      ],
      [
        { row: 1, col: 0, solution: "A" },
        { row: 1, col: 1, solution: null },
        { row: 1, col: 2, solution: "O" },
      ],
      [
        { row: 2, col: 0, solution: "B", number: 3 },
        { row: 2, col: 1, solution: "E" },
        { row: 2, col: 2, solution: "T" },
      ],
    ],
    clues: [
      { direction: "across", number: 1, text: "Feline", row: 0, col: 0, length: 3, answer: "CAT" },
      { direction: "across", number: 3, text: "Wager", row: 2, col: 0, length: 3, answer: "BET" },
      { direction: "down", number: 1, text: "Taxi", row: 0, col: 0, length: 3, answer: "CAB" },
      { direction: "down", number: 2, text: "Digit", row: 0, col: 2, length: 3, answer: "TOT" },
    ],
  };
}

describe("isBlack", () => {
  const puzzle = makeTestPuzzle();

  it("returns false for white cells", () => {
    expect(isBlack(puzzle, 0, 0)).toBe(false);
    expect(isBlack(puzzle, 2, 2)).toBe(false);
  });

  it("returns true for black cells", () => {
    expect(isBlack(puzzle, 1, 1)).toBe(true);
  });

  it("returns true for out-of-bounds coordinates", () => {
    expect(isBlack(puzzle, -1, 0)).toBe(true);
    expect(isBlack(puzzle, 0, 5)).toBe(true);
  });
});

describe("getWordCells", () => {
  const puzzle = makeTestPuzzle();

  it("returns across word cells for 1-Across", () => {
    const cells = getWordCells(puzzle, 0, 1, "across");
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
  });

  it("returns down word cells for 1-Down", () => {
    const cells = getWordCells(puzzle, 1, 0, "down");
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]);
  });

  it("returns empty for black cell", () => {
    expect(getWordCells(puzzle, 1, 1, "across")).toEqual([]);
  });

  it("stops at black cells for across in row 2", () => {
    const cells = getWordCells(puzzle, 2, 0, "across");
    expect(cells).toEqual([
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
  });
});

describe("getNextCell", () => {
  const puzzle = makeTestPuzzle();

  it("returns next cell across", () => {
    expect(getNextCell(puzzle, 0, 0, "across")).toEqual({ row: 0, col: 1 });
  });

  it("returns next cell down", () => {
    expect(getNextCell(puzzle, 0, 0, "down")).toEqual({ row: 1, col: 0 });
  });

  it("returns null at edge", () => {
    expect(getNextCell(puzzle, 0, 2, "across")).toBeNull();
    expect(getNextCell(puzzle, 2, 0, "down")).toBeNull();
  });

  it("returns null when next is black", () => {
    expect(getNextCell(puzzle, 1, 0, "across")).toBeNull();
  });
});

describe("getPrevCell", () => {
  const puzzle = makeTestPuzzle();

  it("returns previous cell across", () => {
    expect(getPrevCell(puzzle, 0, 1, "across")).toEqual({ row: 0, col: 0 });
  });

  it("returns null at start", () => {
    expect(getPrevCell(puzzle, 0, 0, "across")).toBeNull();
    expect(getPrevCell(puzzle, 0, 0, "down")).toBeNull();
  });
});

describe("computeCellNumbers", () => {
  const puzzle = makeTestPuzzle();
  const numbers = computeCellNumbers(puzzle);

  it("assigns number 1 to top-left", () => {
    expect(numbers.get("0,0")).toBe(1);
  });

  it("assigns number to cell that starts a word", () => {
    expect(numbers.get("0,2")).toBe(2);
  });

  it("assigns number to 3-Across start", () => {
    expect(numbers.get("2,0")).toBe(3);
  });

  it("does not number cells that don't start words", () => {
    expect(numbers.has("0,1")).toBe(false);
    expect(numbers.has("1,0")).toBe(false);
  });
});
