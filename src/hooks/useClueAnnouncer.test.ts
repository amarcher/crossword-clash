// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useClueAnnouncer } from "./useClueAnnouncer";
import type { PuzzleClue } from "../types/puzzle";

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

describe("useClueAnnouncer", () => {
  it("does not announce on initial mount (skips existing completed clues)", () => {
    const completed = new Map([
      ["across-1", { playerId: "andy-id" }],
    ]);

    renderHook(() => useClueAnnouncer(completed, clues, players));

    expect(spokenTexts).toHaveLength(0);
  });

  it("announces a newly completed clue", () => {
    const initial = new Map<string, { playerId: string }>();
    const { rerender } = renderHook(
      ({ completed }) => useClueAnnouncer(completed, clues, players),
      { initialProps: { completed: initial } },
    );

    const updated = new Map([["across-1", { playerId: "andy-id" }]]);
    rerender({ completed: updated });

    expect(spokenTexts).toHaveLength(1);
    expect(spokenTexts[0]).toBe("Andy — 1 across — Feline. — cat");
  });

  it("announces multiple new clues at once", () => {
    const initial = new Map<string, { playerId: string }>();
    const { rerender } = renderHook(
      ({ completed }) => useClueAnnouncer(completed, clues, players),
      { initialProps: { completed: initial } },
    );

    const updated = new Map([
      ["across-3", { playerId: "jack-id" }],
      ["down-1", { playerId: "jack-id" }],
    ]);
    rerender({ completed: updated });

    expect(spokenTexts).toHaveLength(2);
    expect(spokenTexts).toContain("Jack — 3 across — Wager. — bet");
    expect(spokenTexts).toContain("Jack — 1 down — Taxi. — cab");
  });

  it("does not re-announce previously completed clues", () => {
    const initial = new Map<string, { playerId: string }>();
    const { rerender } = renderHook(
      ({ completed }) => useClueAnnouncer(completed, clues, players),
      { initialProps: { completed: initial } },
    );

    const first = new Map([["across-1", { playerId: "andy-id" }]]);
    rerender({ completed: first });
    expect(spokenTexts).toHaveLength(1);

    // Add a second clue — only the new one should be announced
    const second = new Map([
      ["across-1", { playerId: "andy-id" }],
      ["across-3", { playerId: "jack-id" }],
    ]);
    rerender({ completed: second });

    expect(spokenTexts).toHaveLength(2);
    expect(spokenTexts[1]).toBe("Jack — 3 across — Wager. — bet");
  });

  it("uses 'Unknown' for unrecognized player IDs", () => {
    const initial = new Map<string, { playerId: string }>();
    const { rerender } = renderHook(
      ({ completed }) => useClueAnnouncer(completed, clues, players),
      { initialProps: { completed: initial } },
    );

    const updated = new Map([["across-1", { playerId: "mystery-id" }]]);
    rerender({ completed: updated });

    expect(spokenTexts).toHaveLength(1);
    expect(spokenTexts[0]).toMatch(/^Unknown/);
  });

  it("lowercases the answer so TTS reads it as a word", () => {
    const initial = new Map<string, { playerId: string }>();
    const { rerender } = renderHook(
      ({ completed }) => useClueAnnouncer(completed, clues, players),
      { initialProps: { completed: initial } },
    );

    const updated = new Map([["down-2", { playerId: "andy-id" }]]);
    rerender({ completed: updated });

    expect(spokenTexts[0]).toBe("Andy — 2 down — Small child. — tot");
  });

  it("handles empty players list gracefully", () => {
    const initial = new Map<string, { playerId: string }>();
    const { rerender } = renderHook(
      ({ completed }) => useClueAnnouncer(completed, clues, []),
      { initialProps: { completed: initial } },
    );

    const updated = new Map([["across-1", { playerId: "andy-id" }]]);
    rerender({ completed: updated });

    expect(spokenTexts).toHaveLength(1);
    expect(spokenTexts[0]).toMatch(/^Unknown/);
  });
});
