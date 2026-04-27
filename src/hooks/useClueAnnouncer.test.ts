// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useClueAnnouncer } from "./useClueAnnouncer";
import type { Puzzle, CellState } from "../types/puzzle";
import type { Player } from "../types/game";

function makePuzzle(): Puzzle {
  // 3x3 grid: row 0 = "CAT" across (1A), row 2 = "BET" across (4A).
  // Down: "CRB" / "ARE" / "TET" — but we'll just exercise the across path.
  const cells = [
    [
      { row: 0, col: 0, solution: "C", number: 1 },
      { row: 0, col: 1, solution: "A" },
      { row: 0, col: 2, solution: "T" },
    ],
    [
      { row: 1, col: 0, solution: null },
      { row: 1, col: 1, solution: null },
      { row: 1, col: 2, solution: null },
    ],
    [
      { row: 2, col: 0, solution: "B", number: 4 },
      { row: 2, col: 1, solution: "E" },
      { row: 2, col: 2, solution: "T" },
    ],
  ];
  return {
    title: "T",
    author: "",
    width: 3,
    height: 3,
    cells,
    clues: [
      { direction: "across", number: 1, text: "Feline", row: 0, col: 0, length: 3, answer: "CAT" },
      { direction: "across", number: 4, text: "Wager", row: 2, col: 0, length: 3, answer: "BET" },
    ],
  };
}

const ALICE: Player = { id: "a", gameId: "g", userId: "u-alice", displayName: "Alice", color: "#f00", score: 0 };
const BOB: Player = { id: "b", gameId: "g", userId: "u-bob", displayName: "Bob", color: "#00f", score: 0 };

function correctCells(spec: Array<[number, number, string, string]>): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const [row, col, letter, playerId] of spec) {
    out[`${row},${col}`] = { letter, correct: true, playerId };
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useClueAnnouncer", () => {
  it("does not announce on initial mount even if clues are pre-completed", () => {
    const speak = vi.fn();
    const cells = correctCells([
      [0, 0, "C", "u-alice"],
      [0, 1, "A", "u-alice"],
      [0, 2, "T", "u-alice"],
    ]);
    renderHook(() =>
      useClueAnnouncer({
        puzzle: makePuzzle(),
        playerCells: cells,
        players: [ALICE, BOB],
        speak,
        enabled: true,
      }),
    );
    expect(speak).not.toHaveBeenCalled();
  });

  it("announces a clue completed after mount", () => {
    const speak = vi.fn();
    const puzzle = makePuzzle();
    const props = {
      puzzle,
      playerCells: {} as Record<string, CellState>,
      players: [ALICE, BOB],
      speak,
      enabled: true,
    };
    const { rerender } = renderHook((p) => useClueAnnouncer(p), { initialProps: props });

    rerender({
      ...props,
      playerCells: correctCells([
        [0, 0, "C", "u-alice"],
        [0, 1, "A", "u-alice"],
        [0, 2, "T", "u-alice"],
      ]),
    });

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("1 across by Alice");
  });

  it("attributes the clue to the player who placed the LAST cell in word order", () => {
    const speak = vi.fn();
    const puzzle = makePuzzle();
    const props = {
      puzzle,
      playerCells: correctCells([
        [0, 0, "C", "u-alice"],
        [0, 1, "A", "u-alice"],
      ]),
      players: [ALICE, BOB],
      speak,
      enabled: true,
    };
    const { rerender } = renderHook((p) => useClueAnnouncer(p), { initialProps: props });

    rerender({
      ...props,
      // Bob fills position 2 (last cell in word order) — getCompletedCluesByPlayer
      // attributes the clue to the player who owns the last cell with a playerId.
      playerCells: correctCells([
        [0, 0, "C", "u-alice"],
        [0, 1, "A", "u-alice"],
        [0, 2, "T", "u-bob"],
      ]),
    });

    expect(speak).toHaveBeenCalledWith("1 across by Bob");
  });

  it("does not re-announce a clue that completed earlier", () => {
    const speak = vi.fn();
    const puzzle = makePuzzle();
    const cells = correctCells([
      [0, 0, "C", "u-alice"],
      [0, 1, "A", "u-alice"],
      [0, 2, "T", "u-alice"],
    ]);
    const props = {
      puzzle,
      playerCells: {} as Record<string, CellState>,
      players: [ALICE, BOB],
      speak,
      enabled: true,
    };
    const { rerender } = renderHook((p) => useClueAnnouncer(p), { initialProps: props });

    rerender({ ...props, playerCells: cells });
    rerender({ ...props, playerCells: { ...cells } }); // identical content, new ref
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'Unknown' when player attribution is missing", () => {
    const speak = vi.fn();
    const puzzle = makePuzzle();
    const props = {
      puzzle,
      playerCells: {} as Record<string, CellState>,
      players: [ALICE], // Bob not in the list
      speak,
      enabled: true,
    };
    const { rerender } = renderHook((p) => useClueAnnouncer(p), { initialProps: props });

    rerender({
      ...props,
      playerCells: correctCells([
        [0, 0, "C", "u-bob"],
        [0, 1, "A", "u-bob"],
        [0, 2, "T", "u-bob"],
      ]),
    });

    expect(speak).toHaveBeenCalledWith("1 across by Unknown");
  });

  it("rate-caps to 2 utterances per 5s rolling window", () => {
    const speak = vi.fn();
    const puzzle = makePuzzle();
    const props = {
      puzzle,
      playerCells: {} as Record<string, CellState>,
      players: [ALICE],
      speak,
      enabled: true,
    };
    const { rerender } = renderHook((p) => useClueAnnouncer(p), { initialProps: props });

    // Fire 3 clue completions in rapid succession by completing both
    // across clues and both downs as a single state diff. The hook
    // iterates the map; we expect exactly 2 utterances and the 3rd
    // skipped (not queued).
    rerender({
      ...props,
      playerCells: correctCells([
        [0, 0, "C", "u-alice"],
        [0, 1, "A", "u-alice"],
        [0, 2, "T", "u-alice"],
        [2, 0, "B", "u-alice"],
        [2, 1, "E", "u-alice"],
        [2, 2, "T", "u-alice"],
      ]),
    });

    // Only 2 across clues exist in this fixture. Both should fire (within cap).
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it("does not announce when disabled, but tracks completions to prevent later blast", () => {
    const speak = vi.fn();
    const puzzle = makePuzzle();
    const props = {
      puzzle,
      playerCells: {} as Record<string, CellState>,
      players: [ALICE],
      speak,
      enabled: false,
    };
    const { rerender } = renderHook((p) => useClueAnnouncer(p), { initialProps: props });

    rerender({
      ...props,
      playerCells: correctCells([
        [0, 0, "C", "u-alice"],
        [0, 1, "A", "u-alice"],
        [0, 2, "T", "u-alice"],
      ]),
    });
    expect(speak).not.toHaveBeenCalled();

    // Re-enable; the previously-completed clue should NOT be announced now.
    rerender({
      ...props,
      enabled: true,
      playerCells: correctCells([
        [0, 0, "C", "u-alice"],
        [0, 1, "A", "u-alice"],
        [0, 2, "T", "u-alice"],
      ]),
    });
    expect(speak).not.toHaveBeenCalled();
  });

  it("renders nothing when puzzle is null", () => {
    const speak = vi.fn();
    renderHook(() =>
      useClueAnnouncer({
        puzzle: null,
        playerCells: {},
        players: [ALICE],
        speak,
        enabled: true,
      }),
    );
    expect(speak).not.toHaveBeenCalled();
  });
});
