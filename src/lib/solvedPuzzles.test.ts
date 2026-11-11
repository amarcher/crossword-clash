// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Puzzle } from "../types/puzzle";

const history = vi.hoisted(() => ({ state: null as unknown }));
vi.mock("./solveHistory", () => ({ getSolveHistoryState: () => history.state }));

import { solutionCells, solvedSeconds } from "./solvedPuzzles";
import { recordSoloCompletion } from "./soloStats";

// The device's stats as a real finish leaves them.
const local = (bestTimes: Record<string, number>) => {
  for (const [key, seconds] of Object.entries(bestTimes)) recordSoloCompletion(key, seconds);
};

beforeEach(() => {
  localStorage.clear();
  history.state = null;
});

describe("solvedSeconds", () => {
  it("is null for a puzzle with no recorded finish", () => {
    expect(solvedSeconds("k")).toBeNull();
  });

  it("reads this device's best time while no account history is loaded", () => {
    local({ k: 84 });
    expect(solvedSeconds("k")).toBe(84);
    history.state = { userId: "u", status: "loading", rows: null, summary: { bestTimes: {} } };
    expect(solvedSeconds("k")).toBe(84);
  });

  it("prefers the account's history once it is loaded, and falls back to the device for a puzzle it lacks", () => {
    local({ k: 84, only_here: 30 });
    history.state = { userId: "u", status: "ready", rows: [], summary: { bestTimes: { k: 61 } } };
    expect(solvedSeconds("k")).toBe(61);
    expect(solvedSeconds("only_here")).toBe(30);
    expect(solvedSeconds("nowhere")).toBeNull();
  });
});

describe("solutionCells", () => {
  it("is every white square with its solution, marked correct, and no black square", () => {
    const puzzle = {
      title: "T", author: "", width: 2, height: 2, clues: [],
      cells: [
        [{ row: 0, col: 0, solution: "A" }, { row: 0, col: 1, solution: null }],
        [{ row: 1, col: 0, solution: "B" }, { row: 1, col: 1, solution: "C" }],
      ],
    } as unknown as Puzzle;
    expect(solutionCells(puzzle)).toEqual({
      "0,0": { letter: "A", correct: true },
      "1,0": { letter: "B", correct: true },
      "1,1": { letter: "C", correct: true },
    });
  });
});
