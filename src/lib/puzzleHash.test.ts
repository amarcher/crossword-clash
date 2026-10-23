import { describe, expect, it } from "vitest";
import { canonicalJson, puzzleContentHash, puzzleContentText } from "./puzzleHash";
import { SAMPLE_PUZZLES } from "./samplePuzzles";
import type { Puzzle } from "../types/puzzle";

const puzzle = SAMPLE_PUZZLES[0].puzzle;

describe("canonicalJson", () => {
  it("sorts object keys at every depth and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("drops undefined values like JSON.stringify", () => {
    expect(canonicalJson({ a: undefined, b: "x" })).toBe('{"b":"x"}');
    expect(canonicalJson([1, undefined])).toBe("[1,null]");
    expect(canonicalJson("s")).toBe('"s"');
  });
});

describe("puzzleContentHash", () => {
  it("is a lower-case hex SHA-256 and stable across calls", async () => {
    const a = await puzzleContentHash(puzzle);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await puzzleContentHash(puzzle)).toBe(a);
  });

  it("ignores key order and fields the row does not store", async () => {
    const reordered: Puzzle = {
      clues: puzzle.clues.map((c) => ({ answer: c.answer, length: c.length, col: c.col, row: c.row, text: c.text, number: c.number, direction: c.direction })),
      height: puzzle.height,
      cells: puzzle.cells.map((row) => row.map((c) => ({ col: c.col, solution: c.solution, row: c.row, ...(c.number !== undefined ? { number: c.number } : {}) }))),
      width: puzzle.width,
      author: puzzle.author,
      title: puzzle.title,
      origin: "nyt-bookmarklet",
      source: { provider: "nyt", date: "2026-10-23", kind: "mini", url: "https://example.test" },
    };
    expect(await puzzleContentHash(reordered)).toBe(await puzzleContentHash(puzzle));
    expect(puzzleContentText(reordered)).toBe(puzzleContentText(puzzle));
  });

  it("changes when a clue, a cell or the title changes", async () => {
    const base = await puzzleContentHash(puzzle);
    const clue = { ...puzzle, clues: puzzle.clues.map((c, i) => (i === 0 ? { ...c, text: `${c.text} (edited)` } : c)) };
    const title = { ...puzzle, title: `${puzzle.title} II` };
    const cells = puzzle.cells.map((row) => row.map((c) => ({ ...c })));
    const white = cells.flat().find((c) => c.solution !== null)!;
    white.solution = white.solution === "A" ? "B" : "A";
    const grid = { ...puzzle, cells };
    const hashes = await Promise.all([clue, title, grid].map(puzzleContentHash));
    for (const h of hashes) expect(h).not.toBe(base);
    expect(new Set(hashes).size).toBe(3);
  });
});
