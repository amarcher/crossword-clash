import { describe, expect, it } from "vitest";
import { firstToSquare, progressAt, raceLane, raceShareCode, runningOrder, settledAt, squaresFirst, type RaceSolve } from "./friendRace";
import { decodeRaceReplay } from "./replayCode";

const solve = (id: string, seconds: number, events: RaceSolve["events"]): RaceSolve => ({ id, name: id, color: "#000000", seconds, events });

describe("settledAt", () => {
  it("settles a square when it takes its final letter, not when it was first touched", () => {
    const at = settledAt([[1_000, 0, "X"], [2_000, 1, "B"], [3_000, 0, "A"], [4_000, 1, "B"]]);
    // Square 0 was wrong until 3 s; square 1 was retyped with the same letter, so 2 s stands.
    expect([...at]).toEqual([[0, 3_000], [1, 2_000]]);
  });

  it("forgets an erased square until it is filled again", () => {
    expect([...settledAt([[1_000, 0, "A"], [2_000, 0, ""]])]).toEqual([]);
    expect([...settledAt([[1_000, 0, "A"], [2_000, 0, ""], [5_000, 0, "A"]])]).toEqual([[0, 5_000]]);
  });

  it("reads a recording without letters as filled or empty", () => {
    expect([...settledAt([[1_000, 0, 1], [2_000, 0, 1], [3_000, 1, 1], [4_000, 1, 0]])]).toEqual([[0, 1_000]]);
  });
});

describe("the race on one clock", () => {
  const you = raceLane(solve("you", 8, [[1_000, 0, "A"], [3_000, 1, "B"], [6_000, 2, "C"], [8_000, 3, "D"]]));
  const ann = raceLane(solve("ann", 5, [[500, 3, "D"], [2_000, 2, "C"], [4_000, 1, "B"], [5_000, 0, "A"]]));
  const lanes = [you, ann];

  it("measures how much each solver had settled, whole once their clock stops", () => {
    expect(progressAt(you, 3_500, 4)).toBe(0.5);
    expect(progressAt(ann, 3_500, 4)).toBe(0.5);
    expect(progressAt(ann, 5_000, 4)).toBe(1);
    // A recording that lost its last letter still ends whole.
    expect(progressAt(raceLane(solve("cut", 5, [[1_000, 0, "A"]])), 5_000, 4)).toBe(1);
  });

  it("gives each square to whoever settled it first", () => {
    const first = firstToSquare(lanes);
    expect(first.get(0)).toEqual({ lane: 0, ms: 1_000 });
    expect(first.get(1)).toEqual({ lane: 0, ms: 3_000 });
    expect(first.get(2)).toEqual({ lane: 1, ms: 2_000 });
    expect(first.get(3)).toEqual({ lane: 1, ms: 500 });
    expect(squaresFirst(first, 2, 1_500)).toEqual([1, 1]);
    expect(squaresFirst(first, 2, 10_000)).toEqual([2, 2]);
  });

  it("makes the clip's code: each square to whoever was first, solvers in order of squares won", () => {
    const grid = { width: 2, height: 2, cells: [[{ solution: "A" }, { solution: "B" }], [{ solution: "C" }, { solution: "D" }]] };
    const bo = raceLane({ ...solve("bo", 9, [[100, 0, "A"], [200, 1, "B"], [300, 2, "C"], [9_000, 3, "D"]]), color: "#22c55e" });
    const mine = raceLane({ ...you.solve, color: "#3a6bf0" });
    const hers = raceLane({ ...ann.solve, color: "#ef4444" });
    const decoded = decodeRaceReplay(raceShareCode(grid, [mine, hers, bo])!)!;
    // Bo was first to three squares, Ann to one, you to none: that is the bars' order.
    expect(decoded.colors).toEqual([[34, 197, 94], [239, 68, 68], [58, 107, 240]]);
    expect(decoded.claims.map((c) => [c.cell, c.player])).toEqual([[0, 0], [1, 0], [2, 0], [3, 1]]);
    // The clip ends when the last square is first settled, not at the slowest finish.
    expect(decoded.seconds).toBe(1);
    expect(raceShareCode(grid, [])).toBeNull();
    expect(raceShareCode(grid, Array.from({ length: 9 }, () => mine))).toBeNull();
  });

  it("orders the lanes: finishers by time, the rest by progress", () => {
    expect(runningOrder(lanes, 700, 4)).toEqual([1, 0]);
    expect(runningOrder(lanes, 1_500, 4)).toEqual([0, 1]);
    expect(runningOrder(lanes, 5_500, 4)).toEqual([1, 0]);
    expect(runningOrder(lanes, 9_000, 4)).toEqual([1, 0]);
  });
});
