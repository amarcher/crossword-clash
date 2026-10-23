// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSoloTimer } from "./useSoloTimer";
import { puzzleIdentity, saveSoloTimer } from "../lib/soloStats";
import { getProgress, recordProgressCells } from "../lib/soloProgress";
import type { Puzzle } from "../types/puzzle";

function puzzle(title: string, letter: string): Puzzle {
  const cells = [[{ row: 0, col: 0, solution: letter }, { row: 0, col: 1, solution: letter }]];
  return { title, author: "", width: 2, height: 1, cells, clues: [] } as unknown as Puzzle;
}
const one = puzzle("One", "A");
const two = puzzle("Two", "B");
const typed = { "0,0": { letter: "A", correct: true } };

describe("useSoloTimer + per-puzzle progress", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resumes another started puzzle's clock from its progress record when the timer record is for the last puzzle", () => {
    // The last puzzle played was "two"; "one" was started earlier and has 90 s on its record.
    saveSoloTimer({ key: puzzleIdentity(two), elapsedMs: 5000, completed: false });
    recordProgressCells(puzzleIdentity(one), typed, 2, 1);
    localStorage.setItem(
      "crossword-clash:solo-progress",
      JSON.stringify({ [puzzleIdentity(one)]: { ...getProgress(puzzleIdentity(one)), elapsedMs: 90_000 } }),
    );
    const { result } = renderHook(() => useSoloTimer(one, false));
    expect(result.current.getElapsedSeconds()).toBe(90);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.getElapsedSeconds()).toBe(92);
  });

  it("checkpoints the clock into the progress record and clears the record on completion", () => {
    const key = puzzleIdentity(one);
    recordProgressCells(key, typed, 2, 1);
    const { result, rerender } = renderHook(({ done }) => useSoloTimer(one, done), { initialProps: { done: false } });
    act(() => vi.advanceTimersByTime(5000)); // the 5 s checkpoint
    expect(getProgress(key)?.elapsedMs).toBeGreaterThanOrEqual(5000);
    rerender({ done: true });
    expect(result.current.result?.finishSeconds).toBe(5);
    expect(getProgress(key)).toBeNull();
  });

  it("starts from zero for a puzzle with no record of either kind", () => {
    const { result } = renderHook(() => useSoloTimer(two, false));
    expect(result.current.getElapsedSeconds()).toBe(0);
  });
});
