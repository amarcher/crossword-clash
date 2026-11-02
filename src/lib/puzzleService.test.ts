import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_PUZZLES } from "./samplePuzzles";
import { puzzleContentHash } from "./puzzleHash";

// A chainable PostgREST fake: every call records itself; the terminal
// `maybeSingle` / `single` resolves with the next scripted result, and so
// does awaiting the chain itself (an `order` or `update(...).eq(...)` query).
const calls: { table: string; op: string; args: unknown[] }[] = [];
let results: { data: unknown; error: unknown }[] = [];
function chain(table: string) {
  const api: Record<string, (...args: unknown[]) => unknown> = {};
  for (const op of ["select", "eq", "insert", "update", "order", "maybeSingle", "single"]) {
    api[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      if (op === "maybeSingle" || op === "single") return Promise.resolve(results.shift() ?? { data: null, error: null });
      return api;
    };
  }
  api.then = ((resolve: (r: unknown) => unknown) => Promise.resolve(results.shift() ?? { data: null, error: null }).then(resolve)) as (...args: unknown[]) => unknown;
  return api;
}
vi.mock("./supabaseClient", () => ({ supabase: { from: (table: string) => chain(table) } }));
vi.mock("./toastBus", () => ({ emitToast: vi.fn() }));
vi.mock("./errorReporting", () => ({ reportError: vi.fn() }));

const { uploadPuzzle, joinGame, rejoinGame } = await import("./puzzleService");
const puzzle = SAMPLE_PUZZLES[0].puzzle;
const puzzleRow = { id: "p1", title: puzzle.title, author: puzzle.author, width: puzzle.width, height: puzzle.height, grid: puzzle.cells, clues: puzzle.clues };
const myRow = { id: "row-me", game_id: "g1", user_id: "me", display_name: "Archer", color: "#3b82f6", score: 0, race_seconds: null, created_at: "2026-10-30T00:00:00Z" };
const hostRow = { ...myRow, id: "row-host", user_id: "host", display_name: "Alicia", color: "#ef4444" };
const renames = () => calls.filter((c) => c.table === "players" && c.op === "update").map((c) => c.args[0]);

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

describe("joinGame with a row already in the game", () => {
  const gameRow = { id: "g1", puzzle_id: "p1", status: "waiting", cells: {} };

  it("renames the row to the name typed this time and returns that name", async () => {
    results = [
      { data: gameRow, error: null }, // the game by code
      { data: [hostRow, myRow], error: null }, // its players
      { data: null, error: null }, // the rename
      { data: puzzleRow, error: null },
    ];
    const result = await joinGame("ABCDEF", "me", "Arch");
    expect(renames()).toEqual([{ display_name: "Arch" }]);
    const rename = calls.findIndex((c) => c.op === "update");
    expect(calls[rename + 1]).toMatchObject({ table: "players", op: "eq", args: ["id", "row-me"] });
    expect(calls.some((c) => c.table === "players" && c.op === "insert")).toBe(false);
    expect(result?.players.map((p) => p.displayName)).toEqual(["Alicia", "Arch"]);
  });

  it("issues no update when the typed name is the row's name, nor for a blank one", async () => {
    results = [{ data: gameRow, error: null }, { data: [hostRow, myRow], error: null }, { data: puzzleRow, error: null }];
    expect((await joinGame("ABCDEF", "me", "Archer"))?.players.map((p) => p.displayName)).toEqual(["Alicia", "Archer"]);
    expect(renames()).toEqual([]);
    calls.length = 0;
    results = [{ data: gameRow, error: null }, { data: [hostRow, myRow], error: null }, { data: puzzleRow, error: null }];
    expect((await joinGame("ABCDEF", "me", "  "))?.players.map((p) => p.displayName)).toEqual(["Alicia", "Archer"]);
    expect(renames()).toEqual([]);
  });

  it("keeps the old name when the rename is refused, without failing the join", async () => {
    results = [
      { data: gameRow, error: null },
      { data: [hostRow, myRow], error: null },
      { data: null, error: { code: "42501", message: "permission denied" } },
      { data: puzzleRow, error: null },
    ];
    const result = await joinGame("ABCDEF", "me", "Arch");
    expect(result?.players.map((p) => p.displayName)).toEqual(["Alicia", "Archer"]);
  });
});

describe("rejoinGame", () => {
  const gameRow = { id: "g1", puzzle_id: "p1", status: "waiting", cells: {}, short_code: "ABCDEF" };

  it("renames the player's existing row to the session's name", async () => {
    results = [
      { data: gameRow, error: null },
      { data: puzzleRow, error: null }, // puzzle and players are fetched together
      { data: [hostRow, myRow], error: null },
      { data: null, error: null }, // the rename
    ];
    const result = await rejoinGame("g1", "me", "Arch");
    expect(renames()).toEqual([{ display_name: "Arch" }]);
    expect(result?.players.map((p) => p.displayName)).toEqual(["Alicia", "Arch"]);
  });

  it("never renames for a spectator or an unchanged name", async () => {
    results = [{ data: gameRow, error: null }, { data: puzzleRow, error: null }, { data: [hostRow, myRow], error: null }];
    await rejoinGame("g1", "me", "Arch", { spectator: true });
    expect(renames()).toEqual([]);
    calls.length = 0;
    results = [{ data: gameRow, error: null }, { data: puzzleRow, error: null }, { data: [hostRow, myRow], error: null }];
    await rejoinGame("g1", "me", "Archer");
    expect(renames()).toEqual([]);
  });
});
