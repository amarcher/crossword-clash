import { describe, expect, it } from "vitest";
import { firstToSquare, progressAt, raceLane, runningOrder, settledAt, squaresFirst, type RaceSolve } from "./friendRace";

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

  it("orders the lanes: finishers by time, the rest by progress", () => {
    expect(runningOrder(lanes, 700, 4)).toEqual([1, 0]);
    expect(runningOrder(lanes, 1_500, 4)).toEqual([0, 1]);
    expect(runningOrder(lanes, 5_500, 4)).toEqual([1, 0]);
    expect(runningOrder(lanes, 9_000, 4)).toEqual([1, 0]);
  });
});
