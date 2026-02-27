// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { compressToEncodedURIComponent } from "lz-string";
import { extractPuzzleFromUrl, puzzleToTransferFormat, compressPuzzleToHash } from "./puzzleUrl";
import type { TransferPuzzle } from "./puzzleNormalizer";
import type { Puzzle } from "../types/puzzle";

/**
 * Minimal 3x3 transfer puzzle:
 *   C A T
 *   A # O
 *   B E T
 */
function makeTransferPuzzle(): TransferPuzzle {
  return {
    title: "Test Puzzle",
    author: "Test Author",
    size: { rows: 3, cols: 3 },
    grid: ["C", "A", "T", "A", ".", "O", "B", "E", "T"],
    gridnums: [1, 0, 2, 0, 0, 0, 3, 0, 0],
    clues: {
      across: ["1. Feline", "3. Wager"],
      down: ["1. Taxi", "2. Digit"],
    },
    answers: {
      across: ["CAT", "BET"],
      down: ["CAB", "TOT"],
    },
  };
}

function setHash(hash: string) {
  window.history.replaceState(null, "", window.location.pathname + hash);
}

describe("extractPuzzleFromUrl", () => {
  beforeEach(() => {
    setHash("");
  });

  it("returns null when no hash is present", () => {
    expect(extractPuzzleFromUrl()).toBeNull();
  });

  it("returns null when hash has wrong prefix", () => {
    setHash("#other=data");
    expect(extractPuzzleFromUrl()).toBeNull();
  });

  it("returns a valid Puzzle for properly compressed data", () => {
    const transfer = makeTransferPuzzle();
    const compressed = compressToEncodedURIComponent(JSON.stringify(transfer));
    setHash("#puzzle=" + compressed);

    const puzzle = extractPuzzleFromUrl();
    expect(puzzle).not.toBeNull();
    expect(puzzle!.title).toBe("Test Puzzle");
    expect(puzzle!.author).toBe("Test Author");
    expect(puzzle!.width).toBe(3);
    expect(puzzle!.height).toBe(3);
    expect(puzzle!.cells[1][1].solution).toBeNull(); // black cell
    expect(puzzle!.cells[0][0].solution).toBe("C");
    expect(puzzle!.clues).toHaveLength(4);
  });

  it("clears hash after successful extraction", () => {
    const transfer = makeTransferPuzzle();
    const compressed = compressToEncodedURIComponent(JSON.stringify(transfer));
    setHash("#puzzle=" + compressed);

    extractPuzzleFromUrl();
    expect(window.location.hash).toBe("");
  });

  it("returns null and clears hash for corrupted data", () => {
    setHash("#puzzle=not_valid_compressed_data!!!");

    const puzzle = extractPuzzleFromUrl();
    expect(puzzle).toBeNull();
    expect(window.location.hash).toBe("");
  });

  it("returns null for valid compressed but invalid JSON", () => {
    const compressed = compressToEncodedURIComponent("not json {{{");
    setHash("#puzzle=" + compressed);

    const puzzle = extractPuzzleFromUrl();
    expect(puzzle).toBeNull();
    expect(window.location.hash).toBe("");
  });
});

describe("puzzleToTransferFormat", () => {
  it("converts a Puzzle to TransferPuzzle format", () => {
    const puzzle: Puzzle = {
      title: "Test",
      author: "Author",
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

    const transfer = puzzleToTransferFormat(puzzle);
    expect(transfer.title).toBe("Test");
    expect(transfer.size).toEqual({ rows: 3, cols: 3 });
    expect(transfer.grid).toEqual(["C", "A", "T", "A", ".", "O", "B", "E", "T"]);
    expect(transfer.gridnums).toEqual([1, 0, 2, 0, 0, 0, 3, 0, 0]);
    expect(transfer.clues.across).toEqual(["1. Feline", "3. Wager"]);
    expect(transfer.clues.down).toEqual(["1. Taxi", "2. Digit"]);
    expect(transfer.answers.across).toEqual(["CAT", "BET"]);
    expect(transfer.answers.down).toEqual(["CAB", "TOT"]);
  });

  it("omits circles when no cells are circled", () => {
    const puzzle: Puzzle = {
      title: "T",
      author: "",
      width: 2,
      height: 1,
      cells: [
        [
          { row: 0, col: 0, solution: "A", number: 1 },
          { row: 0, col: 1, solution: "B" },
        ],
      ],
      clues: [
        { direction: "across", number: 1, text: "Clue", row: 0, col: 0, length: 2, answer: "AB" },
      ],
    };

    const transfer = puzzleToTransferFormat(puzzle);
    expect(transfer.circles).toBeUndefined();
  });
});

describe("round-trip", () => {
  it("compressPuzzleToHash → extractPuzzleFromUrl round-trips correctly", () => {
    const original: Puzzle = {
      title: "Round Trip",
      author: "Tester",
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

    const hash = compressPuzzleToHash(original);
    setHash(hash);

    const result = extractPuzzleFromUrl();
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Round Trip");
    expect(result!.author).toBe("Tester");
    expect(result!.width).toBe(3);
    expect(result!.height).toBe(3);
    expect(result!.clues).toHaveLength(4);

    // Verify cell contents match
    expect(result!.cells[0][0].solution).toBe("C");
    expect(result!.cells[1][1].solution).toBeNull();
    expect(result!.cells[2][2].solution).toBe("T");

    // Verify clue answers match
    const across1 = result!.clues.find((c) => c.direction === "across" && c.number === 1)!;
    expect(across1.answer).toBe("CAT");
  });
});
