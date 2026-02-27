// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useClueAnnouncer } from "./useClueAnnouncer";
import type { CellState, PuzzleClue } from "../types/puzzle";

const clues: PuzzleClue[] = [
  { direction: "across", number: 1, text: "Feline.", row: 0, col: 0, length: 3, answer: "CAT" },
  { direction: "across", number: 3, text: "Wager.", row: 2, col: 0, length: 3, answer: "BET" },
  { direction: "down", number: 1, text: "Taxi.", row: 0, col: 0, length: 3, answer: "CAB" },
  { direction: "down", number: 2, text: "Small child.", row: 0, col: 2, length: 3, answer: "TOT" },
];

const players = [
  { userId: "andy-id", displayName: "Andy" },
  { userId: "jack-id", displayName: "Jack" },
];

type HookProps = {
  completed: Map<string, { playerId: string }>;
  cells: Record<string, CellState>;
};

let spokenTexts: string[];

beforeEach(() => {
  spokenTexts = [];
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  vi.stubGlobal("speechSynthesis", {
    speak: vi.fn((utterance: { text: string }) => {
      spokenTexts.push(utterance.text);
    }),
  });
});

function cell(letter: string, playerId: string): CellState {
  return { letter, correct: true, playerId };
}

describe("useClueAnnouncer", () => {
  it("does not announce on initial mount (skips existing completed clues)", () => {
    const completed = new Map([["across-1", { playerId: "andy-id" }]]);
    const cells = {
      "0,0": cell("C", "andy-id"),
      "0,1": cell("A", "andy-id"),
      "0,2": cell("T", "andy-id"),
    };

    renderHook(() => useClueAnnouncer(completed, clues, players, cells));

    expect(spokenTexts).toHaveLength(0);
  });

  it("announces a newly completed clue", () => {
    const emptyCells: Record<string, CellState> = {};
    const { rerender } = renderHook(
      ({ completed, cells }: HookProps) => useClueAnnouncer(completed, clues, players, cells),
      { initialProps: { completed: new Map(), cells: emptyCells } },
    );

    const updated = new Map([["across-1", { playerId: "andy-id" }]]);
    const cells = {
      "0,0": cell("C", "andy-id"),
      "0,1": cell("A", "andy-id"),
      "0,2": cell("T", "andy-id"),
    };
    rerender({ completed: updated, cells });

    expect(spokenTexts).toHaveLength(1);
    expect(spokenTexts[0]).toBe("Andy — 1 across — Feline. — cat");
  });

  it("credits the player who placed the completing cell, not the last positional cell", () => {
    // Andy already filled C and T; Jack fills A to complete the word
    const prevCells = {
      "0,0": cell("C", "andy-id"),
      "0,2": cell("T", "andy-id"),
    };
    const { rerender } = renderHook(
      ({ completed, cells }: HookProps) => useClueAnnouncer(completed, clues, players, cells),
      { initialProps: { completed: new Map(), cells: prevCells } },
    );

    const completed = new Map([["across-1", { playerId: "andy-id" }]]); // getCompletedCluesByPlayer says Andy (last positional)
    const cells = {
      ...prevCells,
      "0,1": cell("A", "jack-id"), // Jack placed the completing cell
    };
    rerender({ completed, cells });

    expect(spokenTexts).toHaveLength(1);
    expect(spokenTexts[0]).toMatch(/^Jack/); // Should credit Jack, not Andy
  });

  it("announces multiple new clues at once", () => {
    // Jack types B at (2,0), completing both across-3 (BET) and down-1 (CAB)
    const prevCells = {
      "0,0": cell("C", "andy-id"),
      "0,1": cell("A", "andy-id"),
      "0,2": cell("T", "andy-id"),
      "2,1": cell("E", "andy-id"),
      "2,2": cell("T", "andy-id"),
      "1,0": cell("A", "andy-id"),
    };
    const { rerender } = renderHook(
      ({ completed, cells }: HookProps) => useClueAnnouncer(completed, clues, players, cells),
      { initialProps: { completed: new Map([["across-1", { playerId: "andy-id" }]]), cells: prevCells } },
    );

    const completed = new Map([
      ["across-1", { playerId: "andy-id" }],
      ["across-3", { playerId: "jack-id" }],
      ["down-1", { playerId: "jack-id" }],
    ]);
    const cells = {
      ...prevCells,
      "2,0": cell("B", "jack-id"),
    };
    rerender({ completed, cells });

    expect(spokenTexts).toHaveLength(2);
    expect(spokenTexts).toContain("Jack — 3 across — Wager. — bet");
    expect(spokenTexts).toContain("Jack — 1 down — Taxi. — cab");
  });

  it("does not re-announce previously completed clues", () => {
    const { rerender } = renderHook(
      ({ completed, cells }: HookProps) => useClueAnnouncer(completed, clues, players, cells),
      { initialProps: { completed: new Map(), cells: {} as Record<string, CellState> } },
    );

    const firstCells = {
      "0,0": cell("C", "andy-id"),
      "0,1": cell("A", "andy-id"),
      "0,2": cell("T", "andy-id"),
    };
    rerender({ completed: new Map([["across-1", { playerId: "andy-id" }]]), cells: firstCells });
    expect(spokenTexts).toHaveLength(1);

    // Add a second clue — only the new one should be announced
    const secondCells = {
      ...firstCells,
      "2,0": cell("B", "jack-id"),
      "2,1": cell("E", "jack-id"),
      "2,2": cell("T", "jack-id"),
    };
    const second = new Map([
      ["across-1", { playerId: "andy-id" }],
      ["across-3", { playerId: "jack-id" }],
    ]);
    rerender({ completed: second, cells: secondCells });

    expect(spokenTexts).toHaveLength(2);
    expect(spokenTexts[1]).toBe("Jack — 3 across — Wager. — bet");
  });

  it("uses 'Unknown' for unrecognized player IDs", () => {
    const { rerender } = renderHook(
      ({ completed, cells }: HookProps) => useClueAnnouncer(completed, clues, players, cells),
      { initialProps: { completed: new Map(), cells: {} as Record<string, CellState> } },
    );

    const cells = {
      "0,0": cell("C", "mystery-id"),
      "0,1": cell("A", "mystery-id"),
      "0,2": cell("T", "mystery-id"),
    };
    rerender({ completed: new Map([["across-1", { playerId: "mystery-id" }]]), cells });

    expect(spokenTexts).toHaveLength(1);
    expect(spokenTexts[0]).toMatch(/^Unknown/);
  });

  it("lowercases the answer so TTS reads it as a word", () => {
    const { rerender } = renderHook(
      ({ completed, cells }: HookProps) => useClueAnnouncer(completed, clues, players, cells),
      { initialProps: { completed: new Map(), cells: {} as Record<string, CellState> } },
    );

    const cells = {
      "0,2": cell("T", "andy-id"),
      "1,2": cell("O", "andy-id"),
      "2,2": cell("T", "andy-id"),
    };
    rerender({ completed: new Map([["down-2", { playerId: "andy-id" }]]), cells });

    expect(spokenTexts[0]).toBe("Andy — 2 down — Small child. — tot");
  });

  it("handles empty players list gracefully", () => {
    const { rerender } = renderHook(
      ({ completed, cells }: HookProps) => useClueAnnouncer(completed, clues, [], cells),
      { initialProps: { completed: new Map(), cells: {} as Record<string, CellState> } },
    );

    const cells = {
      "0,0": cell("C", "andy-id"),
      "0,1": cell("A", "andy-id"),
      "0,2": cell("T", "andy-id"),
    };
    rerender({ completed: new Map([["across-1", { playerId: "andy-id" }]]), cells });

    expect(spokenTexts).toHaveLength(1);
    expect(spokenTexts[0]).toMatch(/^Unknown/);
  });
});
