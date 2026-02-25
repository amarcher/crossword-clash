import { describe, it, expect } from "vitest";
import {
  getCellAt,
  isBlack,
  getWordCells,
  getClueForCell,
  getNextCell,
  getPrevCell,
  getNextWordStart,
  getPrevWordStart,
  getCompletedClues,
  getCompletedCluesByPlayer,
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

describe("getCellAt", () => {
  const puzzle = makeTestPuzzle();

  it("returns the cell at valid coordinates", () => {
    const cell = getCellAt(puzzle, 0, 0);
    expect(cell).not.toBeNull();
    expect(cell!.solution).toBe("C");
  });

  it("returns null for out-of-bounds coordinates", () => {
    expect(getCellAt(puzzle, -1, 0)).toBeNull();
    expect(getCellAt(puzzle, 0, 3)).toBeNull();
    expect(getCellAt(puzzle, 3, 0)).toBeNull();
  });

  it("returns black cell (solution null)", () => {
    const cell = getCellAt(puzzle, 1, 1);
    expect(cell).not.toBeNull();
    expect(cell!.solution).toBeNull();
  });
});

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

describe("getClueForCell", () => {
  const puzzle = makeTestPuzzle();

  it("returns the across clue for a cell in an across word", () => {
    const clue = getClueForCell(puzzle, 0, 1, "across");
    expect(clue).not.toBeNull();
    expect(clue!.number).toBe(1);
    expect(clue!.direction).toBe("across");
    expect(clue!.text).toBe("Feline");
  });

  it("returns the down clue for a cell in a down word", () => {
    const clue = getClueForCell(puzzle, 1, 0, "down");
    expect(clue).not.toBeNull();
    expect(clue!.number).toBe(1);
    expect(clue!.direction).toBe("down");
    expect(clue!.text).toBe("Taxi");
  });

  it("returns null for a black cell", () => {
    expect(getClueForCell(puzzle, 1, 1, "across")).toBeNull();
  });
});

describe("getNextWordStart", () => {
  const puzzle = makeTestPuzzle();

  it("advances to the next clue in the same direction", () => {
    // 1-Across → 3-Across
    const result = getNextWordStart(puzzle, 0, 0, "across");
    expect(result.coord).toEqual({ row: 2, col: 0 });
    expect(result.direction).toBe("across");
  });

  it("wraps to other direction at end of clue list", () => {
    // 3-Across (last across) → 1-Down (first down)
    const result = getNextWordStart(puzzle, 2, 0, "across");
    expect(result.coord).toEqual({ row: 0, col: 0 });
    expect(result.direction).toBe("down");
  });

  it("wraps from last down clue to first across clue", () => {
    // 2-Down (last down) → 1-Across (first across)
    const result = getNextWordStart(puzzle, 0, 2, "down");
    expect(result.coord).toEqual({ row: 0, col: 0 });
    expect(result.direction).toBe("across");
  });
});

describe("getPrevWordStart", () => {
  const puzzle = makeTestPuzzle();

  it("goes to the previous clue in the same direction", () => {
    // 3-Across → 1-Across
    const result = getPrevWordStart(puzzle, 2, 0, "across");
    expect(result.coord).toEqual({ row: 0, col: 0 });
    expect(result.direction).toBe("across");
  });

  it("wraps to other direction at start of clue list", () => {
    // 1-Across (first across) → last down clue (2-Down)
    const result = getPrevWordStart(puzzle, 0, 0, "across");
    expect(result.coord).toEqual({ row: 0, col: 2 });
    expect(result.direction).toBe("down");
  });

  it("wraps from first down clue to last across clue", () => {
    // 1-Down (first down) → 3-Across (last across)
    const result = getPrevWordStart(puzzle, 0, 0, "down");
    expect(result.coord).toEqual({ row: 2, col: 0 });
    expect(result.direction).toBe("across");
  });
});

describe("getCompletedClues", () => {
  const puzzle = makeTestPuzzle();

  it("returns empty set when no cells are filled", () => {
    expect(getCompletedClues(puzzle, {}).size).toBe(0);
  });

  it("returns empty set when word is only partially filled", () => {
    const cells = {
      "0,0": { letter: "C", correct: true },
      "0,1": { letter: "A", correct: true },
    };
    const completed = getCompletedClues(puzzle, cells);
    expect(completed.has("across-1")).toBe(false);
  });

  it("marks a clue completed when all its cells are correct", () => {
    const cells = {
      "0,0": { letter: "C", correct: true },
      "0,1": { letter: "A", correct: true },
      "0,2": { letter: "T", correct: true },
    };
    const completed = getCompletedClues(puzzle, cells);
    expect(completed.has("across-1")).toBe(true);
  });

  it("does not mark clue completed when a cell is incorrect", () => {
    const cells = {
      "0,0": { letter: "C", correct: true },
      "0,1": { letter: "X", correct: false },
      "0,2": { letter: "T", correct: true },
    };
    expect(getCompletedClues(puzzle, cells).has("across-1")).toBe(false);
  });

  it("detects completed down clues", () => {
    const cells = {
      "0,0": { letter: "C", correct: true },
      "1,0": { letter: "A", correct: true },
      "2,0": { letter: "B", correct: true },
    };
    expect(getCompletedClues(puzzle, cells).has("down-1")).toBe(true);
  });

  it("handles overlapping across and down words", () => {
    // Fill all cells for 1-Across (CAT) and 1-Down (CAB) — they share (0,0)
    const cells = {
      "0,0": { letter: "C", correct: true },
      "0,1": { letter: "A", correct: true },
      "0,2": { letter: "T", correct: true },
      "1,0": { letter: "A", correct: true },
      "2,0": { letter: "B", correct: true },
    };
    const completed = getCompletedClues(puzzle, cells);
    expect(completed.has("across-1")).toBe(true);
    expect(completed.has("down-1")).toBe(true);
  });

  it("returns all four clues when entire puzzle is filled", () => {
    const cells = {
      "0,0": { letter: "C", correct: true },
      "0,1": { letter: "A", correct: true },
      "0,2": { letter: "T", correct: true },
      "1,0": { letter: "A", correct: true },
      "1,2": { letter: "O", correct: true },
      "2,0": { letter: "B", correct: true },
      "2,1": { letter: "E", correct: true },
      "2,2": { letter: "T", correct: true },
    };
    const completed = getCompletedClues(puzzle, cells);
    expect(completed.size).toBe(4);
    expect(completed.has("across-1")).toBe(true);
    expect(completed.has("across-3")).toBe(true);
    expect(completed.has("down-1")).toBe(true);
    expect(completed.has("down-2")).toBe(true);
  });

  it("uses direction-number key format", () => {
    const cells = {
      "2,0": { letter: "B", correct: true },
      "2,1": { letter: "E", correct: true },
      "2,2": { letter: "T", correct: true },
    };
    const completed = getCompletedClues(puzzle, cells);
    const keys = [...completed];
    expect(keys.every((k) => /^(across|down)-\d+$/.test(k))).toBe(true);
  });
});

describe("getCompletedCluesByPlayer", () => {
  const puzzle = makeTestPuzzle();

  it("returns empty map when no cells are filled", () => {
    const result = getCompletedCluesByPlayer(puzzle, {});
    expect(result.size).toBe(0);
  });

  it("credits the last cell's playerId as the completer", () => {
    // Complete across-3 (BET): cells (2,0), (2,1), (2,2)
    const cells = {
      "2,0": { letter: "B", correct: true, playerId: "alice" },
      "2,1": { letter: "E", correct: true, playerId: "alice" },
      "2,2": { letter: "T", correct: true, playerId: "bob" },
    };
    const result = getCompletedCluesByPlayer(puzzle, cells);
    expect(result.has("across-3")).toBe(true);
    // Last cell (2,2) was placed by bob
    expect(result.get("across-3")?.playerId).toBe("bob");
  });

  it("credits majority player if last cell has no playerId (solo fill)", () => {
    const cells = {
      "2,0": { letter: "B", correct: true, playerId: "alice" },
      "2,1": { letter: "E", correct: true, playerId: "alice" },
      "2,2": { letter: "T", correct: true },
    };
    const result = getCompletedCluesByPlayer(puzzle, cells);
    expect(result.has("across-3")).toBe(true);
    // Last cell with a playerId is alice at (2,1)
    expect(result.get("across-3")?.playerId).toBe("alice");
  });

  it("returns empty playerId for solo mode (no playerIds)", () => {
    const cells = {
      "2,0": { letter: "B", correct: true },
      "2,1": { letter: "E", correct: true },
      "2,2": { letter: "T", correct: true },
    };
    const result = getCompletedCluesByPlayer(puzzle, cells);
    expect(result.has("across-3")).toBe(true);
    expect(result.get("across-3")?.playerId).toBe("");
  });

  it("tracks multiple completed clues with different players", () => {
    const cells = {
      "0,0": { letter: "C", correct: true, playerId: "alice" },
      "0,1": { letter: "A", correct: true, playerId: "alice" },
      "0,2": { letter: "T", correct: true, playerId: "alice" },
      "2,0": { letter: "B", correct: true, playerId: "bob" },
      "2,1": { letter: "E", correct: true, playerId: "bob" },
      "2,2": { letter: "T", correct: true, playerId: "bob" },
    };
    const result = getCompletedCluesByPlayer(puzzle, cells);
    expect(result.get("across-1")?.playerId).toBe("alice");
    expect(result.get("across-3")?.playerId).toBe("bob");
  });

  it("does not include partially completed clues", () => {
    const cells = {
      "2,0": { letter: "B", correct: true, playerId: "alice" },
      "2,1": { letter: "E", correct: true, playerId: "alice" },
    };
    const result = getCompletedCluesByPlayer(puzzle, cells);
    expect(result.has("across-3")).toBe(false);
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
