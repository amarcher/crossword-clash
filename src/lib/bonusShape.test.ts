import { describe, expect, it } from "vitest";
import { blocksOf, shapePuzzle } from "./bonusShape";

describe("a bonus card's grid shape", () => {
  it("round-trips the black squares without any answer", () => {
    const shape = shapePuzzle({ title: "T", width: 3, height: 2, blocks: "#..." + ".#" });
    expect(shape.cells.flat().map((c) => c.solution)).toEqual([null, "", "", "", "", null]);
    expect(blocksOf(shape)).toBe("#....#");
  });
});
