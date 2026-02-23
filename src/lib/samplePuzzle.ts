import type { Puzzle } from "../types/puzzle";
import { computeCellNumbers } from "./gridUtils";

/**
 * Hardcoded 5x5 puzzle for development.
 * Grid layout (# = black):
 *
 *   A L S O #
 *   L O O P S
 *   # O N C E
 *   S T A R #
 *   P E N S #
 *
 * Numbering: 1(0,0) 2(0,1) 3(0,2) 4(0,3) 5(1,0) 6(1,4) 7(2,1) 8(3,0) 9(4,0)
 */

const grid: (string | null)[][] = [
  ["A", "L", "S", "O", null],
  ["L", "O", "O", "P", "S"],
  [null, "O", "N", "C", "E"],
  ["S", "T", "A", "R", null],
  ["P", "E", "N", "S", null],
];

export const samplePuzzle: Puzzle = {
  title: "Mini Crossword",
  author: "Dev",
  width: 5,
  height: 5,
  cells: grid.map((row, r) =>
    row.map((letter, c) => ({
      row: r,
      col: c,
      solution: letter,
    })),
  ),
  clues: [
    // Across
    { direction: "across", number: 1, text: "\"And ___\"", row: 0, col: 0, length: 4, answer: "ALSO" },
    { direction: "across", number: 5, text: "Repeated cycles", row: 1, col: 0, length: 5, answer: "LOOPS" },
    { direction: "across", number: 7, text: "Upon a time", row: 2, col: 1, length: 4, answer: "ONCE" },
    { direction: "across", number: 8, text: "Celestial body", row: 3, col: 0, length: 4, answer: "STAR" },
    { direction: "across", number: 9, text: "Writing instruments", row: 4, col: 0, length: 4, answer: "PENS" },
    // Down
    { direction: "down", number: 1, text: "Name, for short", row: 0, col: 0, length: 2, answer: "AL" },
    { direction: "down", number: 2, text: "Plunder (var.)", row: 0, col: 1, length: 5, answer: "LOOTE" },
    { direction: "down", number: 3, text: "Sound wave measure", row: 0, col: 2, length: 5, answer: "SONAN" },
    { direction: "down", number: 4, text: "Letter combos", row: 0, col: 3, length: 5, answer: "OPCRS" },
    { direction: "down", number: 6, text: "Compass dir.", row: 1, col: 4, length: 2, answer: "SE" },
    { direction: "down", number: 8, text: "Record format", row: 3, col: 0, length: 2, answer: "SP" },
  ],
};

// Apply computed cell numbers
const numbers = computeCellNumbers(samplePuzzle);
for (const [key, num] of numbers) {
  const [r, c] = key.split(",").map(Number);
  samplePuzzle.cells[r][c].number = num;
}
