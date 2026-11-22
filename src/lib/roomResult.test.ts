import { describe, expect, it } from "vitest";
import { isFinishedGrid } from "./roomResult";

const puzzle = {
  cells: [
    [{ row: 0, col: 0, solution: "A" }, { row: 0, col: 1, solution: null }],
    [{ row: 1, col: 0, solution: "B" }, { row: 1, col: 1, solution: "C" }],
  ],
} as unknown as Parameters<typeof isFinishedGrid>[0];

describe("a room's result", () => {
  it("is a finished grid only when every white square is correct", () => {
    expect(isFinishedGrid(puzzle, { "0,0": { correct: true }, "1,0": { correct: true }, "1,1": { correct: true } })).toBe(true);
    expect(isFinishedGrid(puzzle, { "0,0": { correct: true }, "1,0": { correct: true } })).toBe(false);
    expect(isFinishedGrid(puzzle, { "0,0": { correct: true }, "1,0": { correct: false }, "1,1": { correct: true } })).toBe(false);
  });
});
