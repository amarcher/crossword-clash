import { describe, it, expect } from "vitest";
import {
  encodeChallengeParams,
  decodeChallengeParams,
  buildChallengeUrl,
  parseChallengeUrl,
  compareToChallenge,
} from "./challenge";
import { normalizeTransferPuzzle } from "./puzzleNormalizer";
import type { TransferPuzzle } from "./puzzleNormalizer";
import type { Puzzle } from "../types/puzzle";

/**
 * Minimal 3x3 puzzle:
 *   C A T
 *   A # O
 *   B E T
 */
function makePuzzle(): Puzzle {
  const transfer: TransferPuzzle = {
    title: "Test Puzzle",
    author: "Test Author",
    size: { rows: 3, cols: 3 },
    grid: ["C", "A", "T", "A", ".", "O", "B", "E", "T"],
    gridnums: [1, 0, 2, 0, 0, 0, 3, 0, 0],
    clues: { across: ["1. Feline", "3. Wager"], down: ["1. Taxi", "2. Digit"] },
    answers: { across: ["CAT", "BET"], down: ["CAB", "TOT"] },
  };
  return normalizeTransferPuzzle(transfer);
}

describe("encodeChallengeParams / decodeChallengeParams", () => {
  it("round-trips name and seconds exactly", () => {
    const params = encodeChallengeParams({ name: "Alex", seconds: 272 });
    expect(decodeChallengeParams(params)).toEqual({ name: "Alex", seconds: 272 });
  });

  it("tolerates a leading '?' on decode", () => {
    const params = encodeChallengeParams({ name: "Sam", seconds: 5 });
    expect(decodeChallengeParams("?" + params)).toEqual({ name: "Sam", seconds: 5 });
  });

  it("survives names with spaces and unicode", () => {
    const params = encodeChallengeParams({ name: "José Ω", seconds: 61 });
    expect(decodeChallengeParams(params)).toEqual({ name: "José Ω", seconds: 61 });
  });

  it("floors fractional and clamps negative seconds on encode", () => {
    expect(decodeChallengeParams(encodeChallengeParams({ name: "A", seconds: 9.9 }))).toEqual({
      name: "A",
      seconds: 9,
    });
    expect(decodeChallengeParams(encodeChallengeParams({ name: "A", seconds: -4 }))).toEqual({
      name: "A",
      seconds: 0,
    });
  });

  it("returns null when params are absent", () => {
    expect(decodeChallengeParams("")).toBeNull();
    expect(decodeChallengeParams("?foo=bar")).toBeNull();
  });

  it("returns null when name is missing or blank", () => {
    expect(decodeChallengeParams("cf=&ct=30")).toBeNull();
    expect(decodeChallengeParams("cf=%20%20&ct=30")).toBeNull();
    expect(decodeChallengeParams("ct=30")).toBeNull();
  });

  it("returns null when time is missing or malformed", () => {
    expect(decodeChallengeParams("cf=Alex")).toBeNull();
    expect(decodeChallengeParams("cf=Alex&ct=fast")).toBeNull();
    expect(decodeChallengeParams("cf=Alex&ct=-3")).toBeNull();
    expect(decodeChallengeParams("cf=Alex&ct=3.5")).toBeNull();
  });
});

describe("buildChallengeUrl / parseChallengeUrl", () => {
  it("round-trips the puzzle-ref, name and seconds exactly", () => {
    const puzzle = makePuzzle();
    const url = buildChallengeUrl("https://crosswordclash.com", puzzle, {
      name: "Alex",
      seconds: 272,
    });
    const parsed = parseChallengeUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload).toEqual({ name: "Alex", seconds: 272 });
    expect(parsed!.puzzle.title).toBe("Test Puzzle");
    expect(parsed!.puzzle.width).toBe(3);
    expect(parsed!.puzzle.height).toBe(3);
    expect(parsed!.puzzle.cells[0][0].solution).toBe("C");
    expect(parsed!.puzzle.cells[1][1].solution).toBeNull();
    expect(parsed!.puzzle.clues).toHaveLength(4);
  });

  it("normalizes a trailing slash on the origin", () => {
    const url = buildChallengeUrl("https://crosswordclash.com/", makePuzzle(), {
      name: "Al",
      seconds: 10,
    });
    expect(url.startsWith("https://crosswordclash.com/?")).toBe(true);
  });

  it("returns null for a malformed url", () => {
    expect(parseChallengeUrl("not a url")).toBeNull();
  });

  it("returns null when the challenge params are missing", () => {
    const url = buildChallengeUrl("https://crosswordclash.com", makePuzzle(), {
      name: "Al",
      seconds: 10,
    });
    const noParams = url.replace(/\?[^#]*/, "");
    expect(parseChallengeUrl(noParams)).toBeNull();
  });

  it("returns null when the puzzle hash is missing", () => {
    const url = buildChallengeUrl("https://crosswordclash.com", makePuzzle(), {
      name: "Al",
      seconds: 10,
    });
    const noHash = url.replace(/#.*/, "");
    expect(parseChallengeUrl(noHash)).toBeNull();
  });
});

describe("compareToChallenge", () => {
  it("reports a win with the seconds saved", () => {
    expect(compareToChallenge(272, 260)).toEqual({ outcome: "beat", deltaSeconds: 12 });
  });

  it("reports a loss with the seconds behind", () => {
    expect(compareToChallenge(272, 277)).toEqual({ outcome: "lost", deltaSeconds: 5 });
  });

  it("reports a tie with zero delta", () => {
    expect(compareToChallenge(272, 272)).toEqual({ outcome: "tied", deltaSeconds: 0 });
  });

  it("floors fractional times before comparing", () => {
    expect(compareToChallenge(100.9, 100.1)).toEqual({ outcome: "tied", deltaSeconds: 0 });
    expect(compareToChallenge(100, 99.2)).toEqual({ outcome: "beat", deltaSeconds: 1 });
  });

  it("clamps negative times to zero", () => {
    expect(compareToChallenge(-5, 0)).toEqual({ outcome: "tied", deltaSeconds: 0 });
  });
});
