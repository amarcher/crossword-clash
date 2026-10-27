import { describe, it, expect } from "vitest";
import { inProgressRows, recentSolves, solveDate } from "./accountHistory";
import type { ArchiveProgress } from "./archive";
import type { ClassicEntry } from "./classicLibrary";
import type { DailyIndexEntry } from "./dailyIndex";
import type { SolveRow } from "./solveHistory";

const progress = (updatedAt: number, filled = 3): ArchiveProgress => ({ filled, total: 21, elapsedMs: 61_000, updatedAt });
const daily = (identity: string, day: string, title: string): DailyIndexEntry => ({
  day,
  slot: "mini",
  title,
  theme: "",
  author: "",
  width: 5,
  height: 5,
  clues: 10,
  identity,
  blocks: "...../...../...../...../.....",
});
const classic = (identity: string, title: string): ClassicEntry => ({ file: "cwpb1.puz", number: 1, title, author: "", width: 11, height: 11, clues: 40, identity, blurb: "" });
const row = (over: Partial<SolveRow>): SolveRow => ({
  puzzle_key: "k",
  title: "T",
  source: "daily",
  mode: "solo",
  seconds: 90,
  completed_day: "2026-10-20",
  completed_at: "2026-10-20T10:00:00Z",
  ...over,
});

describe("inProgressRows", () => {
  it("names each record from the daily index or the classic manifest, newest touch first, and skips the rest", () => {
    const rows = inProgressRows(
      { d1: progress(10), c1: progress(30), d2: progress(20), imported: progress(99) },
      {},
      [daily("d1", "2026-10-20", "Monday"), daily("d2", "2026-10-21", "Tuesday")],
      [classic("c1", "Classic One")],
    );
    expect(rows.map((r) => [r.kind, r.entry.title])).toEqual([
      ["classic", "Classic One"],
      ["daily", "Tuesday"],
      ["daily", "Monday"],
    ]);
  });

  it("drops a record for a puzzle the account has since solved, and copes with missing lists", () => {
    expect(inProgressRows({ d1: progress(1) }, { d1: 42 }, [daily("d1", "2026-10-20", "Monday")], null)).toEqual([]);
    expect(inProgressRows({ d1: progress(1) }, {}, undefined, undefined)).toEqual([]);
  });

  it("orders same-moment dailies by the newer day", () => {
    const rows = inProgressRows({ a: progress(0), b: progress(0) }, {}, [daily("a", "2026-10-01", "Old"), daily("b", "2026-10-02", "New")], []);
    expect(rows.map((r) => r.entry.title)).toEqual(["New", "Old"]);
  });
});

describe("recentSolves", () => {
  it("lists recorded finishes newest first, never a streak marker, and caps the list", () => {
    const rows = [
      row({ puzzle_key: "a", completed_at: "2026-10-18T10:00:00Z" }),
      row({ puzzle_key: "legacy:daily:2026-10-19", mode: "import", seconds: null, completed_at: "2026-10-19T10:00:00Z" }),
      row({ puzzle_key: "b", completed_at: "2026-10-20T10:00:00Z", seconds: null, mode: "versus" }),
      row({ puzzle_key: "c", completed_at: "2026-10-21T10:00:00Z", mode: "import" }),
    ];
    expect(recentSolves(rows).map((r) => r.puzzle_key)).toEqual(["c", "b", "a"]);
    expect(recentSolves(rows, 2).map((r) => r.puzzle_key)).toEqual(["c", "b"]);
    expect(recentSolves(null)).toEqual([]);
  });
});

describe("solveDate", () => {
  it("drops the year inside the current year and keeps it otherwise", () => {
    expect(solveDate("2026-10-20", "en", "2026-10-27")).toBe("Oct 20");
    expect(solveDate("2025-10-20", "en", "2026-10-27")).toBe("Oct 20, 2025");
    expect(solveDate("junk", "en", "2026-10-27")).toBe("junk");
  });
});
