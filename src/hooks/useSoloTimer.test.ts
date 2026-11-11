// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSoloTimer } from "./useSoloTimer";
import { loadSoloStats, loadSoloTimer, puzzleIdentity, saveSoloTimer } from "../lib/soloStats";
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

describe("solo pause clock", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(100_000); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("excludes a ten-minute break and survives repeated pause events", () => {
    const { result, unmount } = renderHook(() => useSoloTimer(one, false));
    act(() => vi.advanceTimersByTime(651_000));
    act(() => { result.current.pause(); result.current.pause(); });
    expect(result.current.getElapsedSeconds()).toBe(651);
    act(() => vi.advanceTimersByTime(600_000));
    expect(result.current.getElapsedSeconds()).toBe(651);
    act(() => { result.current.resume(); result.current.resume(); });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.getElapsedSeconds()).toBe(653);
    unmount();
  });

  it("returns from hidden paused, and does not add time away after remount", () => {
    const view = renderHook(() => useSoloTimer(one, false));
    act(() => vi.advanceTimersByTime(7000));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(view.result.current.running).toBe(false);
    act(() => vi.advanceTimersByTime(30_000));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(view.result.current.getElapsedSeconds()).toBe(7);
    expect(view.result.current.running).toBe(false);
    view.unmount();
    const restored = renderHook(() => useSoloTimer(one, false, false, () => false));
    expect(restored.result.current.getElapsedSeconds()).toBe(7);
    expect(restored.result.current.running).toBe(false);
    restored.unmount();
  });

  it("checkpoints the outgoing puzzle under its own key before initializing the next", () => {
    recordProgressCells(puzzleIdentity(one), typed, 2);
    recordProgressCells(puzzleIdentity(two), typed, 2);
    const view = renderHook(({ p }) => useSoloTimer(p, false), { initialProps: { p: one } });
    act(() => vi.advanceTimersByTime(7200));
    view.rerender({ p: two });
    expect(getProgress(puzzleIdentity(one))?.elapsedMs).toBe(7200);
    expect(view.result.current.getElapsedSeconds()).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    view.rerender({ p: one });
    expect(getProgress(puzzleIdentity(two))?.elapsedMs).toBe(2000);
    expect(view.result.current.getElapsedSeconds()).toBe(7);
    view.unmount();
  });

  it("never overwrites a finish with an unfinished timer during cleanup", () => {
    const view = renderHook(({ done }) => useSoloTimer(one, done), { initialProps: { done: false } });
    act(() => vi.advanceTimersByTime(1234));
    view.rerender({ done: true });
    view.unmount();
    const restored = renderHook(() => useSoloTimer(one, true));
    expect(restored.result.current.result?.finishSeconds).toBe(1);
    expect(restored.result.current.fresh).toBe(false);
    expect(restored.result.current.running).toBe(false);
    restored.unmount();
  });
});

describe("a puzzle opened already solved", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0)); });
  afterEach(() => { vi.useRealTimers(); });
  const keyTwo = puzzleIdentity(two);
  type Props = { p: Puzzle; done: boolean; solved: { key: string; seconds: number } | null };
  const mount = (initial: Props) =>
    renderHook(({ p, done, solved }: Props) => useSoloTimer(p, done, false, () => true, solved), { initialProps: initial });

  it("shows its recorded time, is no new finish, and owns the stored record even after the previous puzzle's cleanup wrote it", () => {
    // "one" is being played; the solver opens "two", solved before in 61 s, inside the mounted screen.
    const { result, rerender } = mount({ p: one, done: false, solved: null });
    act(() => vi.advanceTimersByTime(3000));
    rerender({ p: two, done: true, solved: { key: keyTwo, seconds: 61 } });
    expect(result.current.getElapsedSeconds()).toBe(61);
    expect(result.current.running).toBe(false);
    expect(result.current.fresh).toBe(false);
    expect(result.current.result?.finishSeconds).toBe(61);
    expect(result.current.result?.isNewBest).toBe(false);
    // The cleanup of "one" checkpointed its own clock first; the record that stands is "two", finished.
    expect(loadSoloTimer()).toEqual({ key: keyTwo, elapsedMs: 61_000, completed: true });
    // Looking at it recorded nothing.
    expect(loadSoloStats().bestTimes[keyTwo]).toBeUndefined();
  });

  it("restart() begins a new attempt: the clock at zero and running, and its finish is a fresh one", () => {
    const { result, rerender } = mount({ p: two, done: true, solved: { key: keyTwo, seconds: 61 } });
    expect(result.current.getElapsedSeconds()).toBe(61);
    act(() => result.current.restart());
    rerender({ p: two, done: false, solved: null });
    expect(result.current.getElapsedSeconds()).toBe(0);
    expect(result.current.running).toBe(true);
    expect(result.current.result).toBeNull();
    expect(loadSoloTimer()).toMatchObject({ key: keyTwo, completed: false });
    act(() => vi.advanceTimersByTime(7000));
    rerender({ p: two, done: true, solved: null });
    expect(result.current.fresh).toBe(true);
    expect(result.current.result?.finishSeconds).toBe(7);
    expect(loadSoloStats().bestTimes[keyTwo]).toBe(7);
  });
});
