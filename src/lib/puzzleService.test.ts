import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_PUZZLES } from "./samplePuzzles";
import { puzzleContentHash } from "./puzzleHash";

// A chainable PostgREST fake: every call records itself; the terminal
// `maybeSingle` / `single` resolves with the next scripted result.
const calls: { table: string; op: string; args: unknown[] }[] = [];
let results: { data: unknown; error: unknown }[] = [];
function chain(table: string) {
  const api: Record<string, (...args: unknown[]) => unknown> = {};
  for (const op of ["select", "eq", "insert", "maybeSingle", "single"]) {
    api[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      if (op === "maybeSingle" || op === "single") return Promise.resolve(results.shift() ?? { data: null, error: null });
      return api;
    };
  }
  return api;
}
vi.mock("./supabaseClient", () => ({ supabase: { from: (table: string) => chain(table) } }));
vi.mock("./toastBus", () => ({ emitToast: vi.fn() }));
vi.mock("./errorReporting", () => ({ reportError: vi.fn() }));

const { uploadPuzzle } = await import("./puzzleService");
const puzzle = SAMPLE_PUZZLES[0].puzzle;

beforeEach(() => {
  calls.length = 0;
  results = [];
});

describe("uploadPuzzle", () => {
  it("returns the existing row for a puzzle already stored under its content hash, without inserting", async () => {
    results = [{ data: { id: "existing-row" }, error: null }];
    expect(await uploadPuzzle(puzzle)).toBe("existing-row");
    const lookup = calls.find((c) => c.op === "eq");
    expect(lookup?.args).toEqual(["file_hash", await puzzleContentHash(puzzle)]);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("inserts a missing puzzle with its content hash in file_hash", async () => {
    results = [
      { data: null, error: null },
      { data: { id: "new-row" }, error: null },
    ];
    expect(await uploadPuzzle(puzzle)).toBe("new-row");
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.args[0]).toMatchObject({
      title: puzzle.title,
      author: puzzle.author,
      width: puzzle.width,
      height: puzzle.height,
      grid: puzzle.cells,
      clues: puzzle.clues,
      file_hash: await puzzleContentHash(puzzle),
    });
  });

  it("re-reads the winner's row when two clients race to insert the same puzzle", async () => {
    results = [
      { data: null, error: null },
      { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      { data: { id: "winner-row" }, error: null },
    ];
    expect(await uploadPuzzle(puzzle)).toBe("winner-row");
    expect(calls.filter((c) => c.op === "eq")).toHaveLength(2);
  });

  it("returns null on any other insert error", async () => {
    results = [
      { data: null, error: null },
      { data: null, error: { code: "42501", message: "permission denied" } },
    ];
    expect(await uploadPuzzle(puzzle)).toBeNull();
  });
});
