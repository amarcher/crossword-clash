import { describe, expect, it } from "vitest";
import { blocksOf, clueCount, shapePuzzle } from "./bonusShape";

describe("a bonus card's grid shape", () => {
  it("round-trips the black squares without any answer", () => {
    const shape = shapePuzzle({ title: "T", width: 3, height: 2, blocks: "#..." + ".#" });
    expect(shape.cells.flat().map((c) => c.solution)).toEqual([null, "", "", "", "", null]);
    expect(blocksOf(shape)).toBe("#....#");
  });

  it("counts the clues from the shape: runs of two or more, across and down", () => {
    // An open 3×3 has 3 across and 3 down; a lone white square starts nothing.
    expect(clueCount({ width: 3, height: 3, blocks: "........." })).toBe(6);
    expect(clueCount({ width: 3, height: 3, blocks: "#.#...#.#" })).toBe(2);
    // The 24 Nov 2026 bonus: 40 clues in its puzzle.
    const blocks = ".....###........#..........#...............#....#.....#####...#####.....#....#...............#..........#........###.....";
    expect(clueCount({ width: 11, height: 11, blocks })).toBe(40);
  });
});
