import { describe, it, expect } from "vitest";
import { normalizeTransferPuzzle } from "./puzzleNormalizer";
import { PlaySessionTracker } from "./playInsights";
import type { CellState } from "../types/puzzle";

// BAT / ORE / WED; downs BOW / ARE / TED.
const puzzle = normalizeTransferPuzzle({
  title: "Tiny",
  author: "",
  size: { rows: 3, cols: 3 },
  grid: ["B", "A", "T", "O", "R", "E", "W", "E", "D"],
  gridnums: [1, 2, 3, 4, 0, 0, 5, 0, 0],
  clues: { across: ["1. Club", "4. Rock", "5. Married"], down: ["1. Bend", "2. Exist", "3. Talk"] },
  answers: { across: ["BAT", "ORE", "WED"], down: ["BOW", "ARE", "TED"] },
});
const clue = (n: number, d: "across" | "down") => puzzle.clues.find((c) => c.number === n && c.direction === d)!;
const meta = { puzzleKey: "k", source: "daily" as const, mode: "solo" as const, client: "web" as const };
const T0 = 1_000_000;
const sec = (s: number) => T0 + s * 1000;

function fill(cells: Record<string, CellState>, keys: string[], playerId?: string) {
  const next = { ...cells };
  for (const k of keys) next[k] = { letter: "X", correct: true, playerId };
  return next;
}

describe("play session tracker", () => {
  it("records per-clue timing, order, wrong letters and letters from crossings", () => {
    const t = new PlaySessionTracker(puzzle, {}, meta, T0, "s1");
    let cells: Record<string, CellState> = {};
    t.selectClue(clue(1, "across"), sec(2));
    t.wrongLetter(clue(1, "across"), sec(5));
    cells = fill(cells, ["0,0", "0,1", "0,2"]);
    t.cellsChanged(cells, "across", null, sec(10));
    t.selectClue(clue(1, "down"), sec(12));
    cells = fill(cells, ["1,0", "2,0"]);
    t.cellsChanged(cells, "down", null, sec(15));

    const r = t.record(sec(20));
    const byKey = Object.fromEntries(r.clues.map((c) => [c.k, c]));
    expect(byKey["1A"]).toEqual({ k: "1A", n: 3, f: 2, s: 10, w: 1, x: 0, o: 1 });
    // BOW: its B came from 1-Across.
    expect(byKey["1D"]).toMatchObject({ f: 12, s: 15, x: 1, o: 2 });
    expect(r).toMatchObject({ id: "s1", cells_filled: 5, cells_at_start: 0, wrong_letters: 1, completed: false, white_cells: 9, elapsed_seconds: 20 });
    // Inputs at 2, 5, 10, 12 and 15 s: 3 + 5 + 2 + 3 active seconds.
    expect(r.active_seconds).toBe(13);
  });

  it("caps idle gaps so a long pause doesn't count as solving", () => {
    const t = new PlaySessionTracker(puzzle, {}, meta, T0);
    t.selectClue(clue(1, "across"), sec(0));
    t.selectClue(clue(4, "across"), sec(600));
    expect(t.record(sec(600)).active_seconds).toBe(30);
  });

  it("attributes another player's letters as not the clue's own", () => {
    const t = new PlaySessionTracker(puzzle, {}, { ...meta, mode: "versus" }, T0);
    const cells = fill({}, ["2,0", "2,1", "2,2"], "rival");
    t.cellsChanged(cells, "across", "me", sec(4));
    const wed = t.record(sec(5)).clues.find((c) => c.k === "5A");
    expect(wed).toMatchObject({ x: 3 });
    // Nothing the local player did counts as activity.
    expect(t.hasActivity).toBe(false);
  });

  it("treats letters already in the grid as a resumed solve", () => {
    const start = fill({}, ["0,0", "0,1", "0,2"]);
    const t = new PlaySessionTracker(puzzle, start, meta, T0);
    t.cellsChanged(fill(start, ["1,0", "2,0"]), "down", null, sec(3));
    const r = t.record(sec(4));
    expect(r.cells_at_start).toBe(3);
    expect(r.cells_filled).toBe(5);
    // 1-Across was done before this visit: no solve time is invented for it.
    expect(r.clues.find((c) => c.k === "1A")).toBeUndefined();
    expect(r.clues.find((c) => c.k === "1D")).toMatchObject({ x: 1, o: 1 });
  });

  it("records the platform and whether the player was signed in", () => {
    const t = new PlaySessionTracker(puzzle, {}, { ...meta, platform: "iOS Safari", signedIn: true }, T0, "s4");
    expect(t.record(sec(1))).toMatchObject({ platform: "iOS Safari", signed_in: true });
    expect(new PlaySessionTracker(puzzle, {}, meta, T0, "s5").record(sec(1))).toMatchObject({ platform: "", signed_in: false });
  });

  it("marks completion", () => {
    const t = new PlaySessionTracker(puzzle, {}, meta, T0);
    t.complete(sec(9));
    expect(t.record(sec(9)).completed).toBe(true);
    expect(t.hasActivity).toBe(true);
  });
});

describe("autocheck", () => {
  it("is recorded as on unless the visit says otherwise", () => {
    expect(new PlaySessionTracker(puzzle, {}, meta, T0, "a1").record(sec(1)).autocheck).toBe(true);
    expect(new PlaySessionTracker(puzzle, {}, { ...meta, autocheck: false }, T0, "a2").record(sec(1)).autocheck).toBe(false);
  });
});
