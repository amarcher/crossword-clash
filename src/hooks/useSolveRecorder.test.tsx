// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSolveRecorder } from "./useRace";
import { saveTrace } from "../lib/race";
import type { CellState } from "../types/puzzle";

/**
 * A puzzle continued on another device keeps its recording (Andrew,
 * 2026-11-16): the letters arrive through progress sync with the recording
 * that made them, and the recorder carries on from it.
 */
const cell = (letter: string): CellState => ({ letter, correct: true }) as CellState;
const two = { "0,0": cell("A"), "0,1": cell("B") };
const three = { ...two, "1,0": cell("C") };
const four = { ...three, "1,1": cell("D") };
const elapsed = () => 9_000;
const run = (cells: Record<string, CellState>) =>
  renderHook(({ playerCells }) => useSolveRecorder({ puzzleKey: "p", width: 2, playerCells, getElapsedMs: elapsed, enabled: true }), {
    initialProps: { playerCells: cells },
  });

beforeEach(() => localStorage.clear());

describe("useSolveRecorder across devices", () => {
  it("carries on from the recording that came with the letters", () => {
    saveTrace({ key: "p", events: [[1_000, 0, "A"], [2_000, 1, "B"]], partial: false });
    const { result, rerender } = run(two);
    rerender({ playerCells: three });
    expect(result.current.take()?.events).toEqual([[1_000, 0, "A"], [2_000, 1, "B"], [9_000, 2, "C"]]);
  });

  it("adopts a recording that arrives while the puzzle is open", () => {
    const { result, rerender } = run({});
    // The other device's letters and recording land together.
    saveTrace({ key: "p", events: [[1_000, 0, "A"], [2_000, 1, "B"], [3_000, 2, "C"]], partial: false });
    rerender({ playerCells: three });
    rerender({ playerCells: four });
    expect(result.current.take()?.events).toEqual([[1_000, 0, "A"], [2_000, 1, "B"], [3_000, 2, "C"], [9_000, 3, "D"]]);
  });

  it("still gives up on letters that arrive with no recording of them", () => {
    const { result, rerender } = run({});
    rerender({ playerCells: three });
    rerender({ playerCells: four });
    expect(result.current.take()).toBeNull();
  });
});
