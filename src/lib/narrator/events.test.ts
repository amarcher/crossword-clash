import { describe, it, expect } from "vitest";
import {
  formatEvent,
  buildGameStartedEvent,
  buildClueCompletedEvent,
  buildLeadChangeEvent,
  buildGameCompletedEvent,
} from "./events";
import type { Puzzle } from "../../types/puzzle";
import type { Player } from "../../types/game";

const makePuzzle = (overrides?: Partial<Puzzle>): Puzzle => ({
  title: "NYT Monday March 3 2026",
  author: "Jane Doe",
  width: 15,
  height: 15,
  cells: [],
  clues: [
    { direction: "across", number: 1, text: "Capital of France", row: 0, col: 0, length: 5, answer: "PARIS" },
    { direction: "across", number: 5, text: "Not cold", row: 0, col: 6, length: 3, answer: "HOT" },
    { direction: "down", number: 1, text: "A fruit", row: 0, col: 0, length: 4, answer: "PEAR" },
  ],
  ...overrides,
});

const makePlayers = (): Player[] => [
  { id: "p1", gameId: "g1", userId: "u1", displayName: "Alice", color: "#ff0000", score: 0 },
  { id: "p2", gameId: "g1", userId: "u2", displayName: "Bob", color: "#0000ff", score: 0 },
];

describe("formatEvent", () => {
  it("formats GAME_STARTED as a single line", () => {
    const event = buildGameStartedEvent(makePuzzle(), makePlayers());
    const text = formatEvent(event);
    expect(text).toContain("GAME_STARTED:");
    expect(text).toContain("Alice, Bob");
  });

  it("formats CLUE_COMPLETED with EVENT and SCORES on separate lines", () => {
    const event = buildClueCompletedEvent(
      "Alice", 1, "Across", "Capital of France", "PARIS",
      [{ name: "Alice", score: 2 }, { name: "Bob", score: 1 }],
      3,
    );
    const text = formatEvent(event);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^EVENT: Alice completed/);
    expect(lines[1]).toMatch(/^SCORES:/);
    // Player name appears only once in EVENT line (not ambiguous)
    expect(lines[0]).not.toContain("Bob");
  });

  it("formats LEAD_CHANGE with EVENT and SCORES on separate lines", () => {
    const event = buildLeadChangeEvent(
      "Bob", "Alice",
      [{ name: "Alice", score: 4 }, { name: "Bob", score: 5 }],
      10,
    );
    const text = formatEvent(event);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^EVENT: Bob takes the lead/);
    expect(lines[1]).toMatch(/^SCORES:/);
  });

  it("formats GAME_COMPLETED with EVENT and FINAL SCORES", () => {
    const event = buildGameCompletedEvent(
      "Alice",
      [{ name: "Alice", score: 7 }, { name: "Bob", score: 3 }],
      10,
    );
    const text = formatEvent(event);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^EVENT: Alice wins!/);
    expect(lines[1]).toMatch(/^FINAL SCORES:/);
  });

  it("uses pipe separators in scores for unambiguous parsing", () => {
    const event = buildClueCompletedEvent(
      "Alice", 1, "Across", "Clue", "ANS",
      [{ name: "Alice", score: 3 }, { name: "Bob", score: 1 }],
      10,
    );
    const text = formatEvent(event);
    expect(text).toContain("Alice: 3/10 | Bob: 1/10");
  });
});

describe("buildGameStartedEvent", () => {
  it("includes player names and puzzle metadata", () => {
    const event = buildGameStartedEvent(makePuzzle(), makePlayers());
    expect(event.type).toBe("GAME_STARTED");
    expect(event.data.playerNames).toEqual(["Alice", "Bob"]);
    expect(event.data.title).toBe("NYT Monday March 3 2026");
    expect(event.data.author).toBe("Jane Doe");
    expect(event.data.width).toBe(15);
    expect(event.data.height).toBe(15);
  });

  it("computes across and down clue counts", () => {
    const event = buildGameStartedEvent(makePuzzle(), makePlayers());
    expect(event.data.acrossCount).toBe(2);
    expect(event.data.downCount).toBe(1);
    expect(event.data.totalClues).toBe(3);
  });
});

describe("buildClueCompletedEvent", () => {
  it("includes clue details and scores", () => {
    const event = buildClueCompletedEvent(
      "Alice",
      1,
      "Across",
      "Capital of France",
      "PARIS",
      [{ name: "Alice", score: 2 }, { name: "Bob", score: 1 }],
      3,
    );
    expect(event.type).toBe("CLUE_COMPLETED");
    expect(event.data.playerName).toBe("Alice");
    expect(event.data.clueNumber).toBe(1);
    expect(event.data.clueDirection).toBe("Across");
    expect(event.data.clueText).toBe("Capital of France");
    expect(event.data.answer).toBe("paris");
  });

  it("computes remaining clues", () => {
    const event = buildClueCompletedEvent(
      "Alice", 1, "Across", "Capital of France", "PARIS",
      [{ name: "Alice", score: 2 }, { name: "Bob", score: 1 }],
      10,
    );
    expect(event.data.remaining).toBe(7);
  });

  it("formats scores string", () => {
    const event = buildClueCompletedEvent(
      "Alice", 1, "Across", "Clue", "ANS",
      [{ name: "Alice", score: 3 }, { name: "Bob", score: 1 }],
      10,
    );
    expect(event.data.scores).toBe("Alice: 3/10 | Bob: 1/10");
  });
});

describe("buildLeadChangeEvent", () => {
  it("includes leader names and scores", () => {
    const event = buildLeadChangeEvent(
      "Bob",
      "Alice",
      [{ name: "Alice", score: 4 }, { name: "Bob", score: 5 }],
      10,
    );
    expect(event.type).toBe("LEAD_CHANGE");
    expect(event.data.newLeader).toBe("Bob");
    expect(event.data.previousLeader).toBe("Alice");
    expect(event.data.scores).toBe("Alice: 4/10 | Bob: 5/10");
  });
});

describe("buildGameCompletedEvent", () => {
  it("includes winner and final scores", () => {
    const event = buildGameCompletedEvent(
      "Alice",
      [{ name: "Alice", score: 7 }, { name: "Bob", score: 3 }],
      10,
    );
    expect(event.type).toBe("GAME_COMPLETED");
    expect(event.data.winner).toBe("Alice");
    expect(event.data.scores).toBe("Alice: 7/10 | Bob: 3/10");
  });
});
