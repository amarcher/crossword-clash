import { describe, expect, it } from "vitest";
import { isTvIntent, TV_CHOOSER_PATH, tvHostPath, withTvIntent } from "./tvHandoff";
import { puzzleFromHash } from "./puzzleUrl";
import { SAMPLE_PUZZLES } from "./samplePuzzles";

describe("tvHandoff", () => {
  it("reads the intent, adds it to a path with or without a query, and keeps other parameters", () => {
    expect(isTvIntent(new URLSearchParams("intent=tv"))).toBe(true);
    expect(isTvIntent(new URLSearchParams("intent=race"))).toBe(false);
    expect(isTvIntent(new URLSearchParams(""))).toBe(false);
    expect(withTvIntent("/archive")).toBe("/archive?intent=tv");
    expect(withTvIntent("/puzzles?size=mini&sort=new")).toBe("/puzzles?size=mini&sort=new&intent=tv");
    expect(withTvIntent("/puzzles?intent=tv")).toBe("/puzzles?intent=tv");
    expect(TV_CHOOSER_PATH).toBe("/host/import");
  });

  it("hands a puzzle to the TV layout as the deep link it already reads", () => {
    const puzzle = SAMPLE_PUZZLES[0].puzzle;
    const path = tvHostPath(puzzle);
    expect(path.startsWith("/host#puzzle=")).toBe(true);
    const back = puzzleFromHash(path.slice("/host".length));
    expect(back?.title).toBe(puzzle.title);
    expect(back?.cells.flat().map((c) => c.solution)).toEqual(puzzle.cells.flat().map((c) => c.solution));
  });
});
