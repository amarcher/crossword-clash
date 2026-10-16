import { describe, it, expect } from "vitest";
import { clueHardness, compareClueIds, describeBreakdown, formatSeconds, hardestClues, pct, rangeBounds, summarize, type ClueInsight, type PuzzleInsight } from "./insights";

const clue = (over: Partial<ClueInsight>): ClueInsight => ({
  clue: "1A",
  letters: 5,
  attempts: 10,
  solves: 10,
  avg_solve_seconds: 20,
  median_solve_seconds: 20,
  wrong_letters: 0,
  crossing_letters: 0,
  unsolved: 0,
  ...over,
});

describe("rangeBounds", () => {
  it("spans the last N days up to just past now", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const r = rangeBounds(7, now);
    expect(r.from).toBe("2026-10-09T12:00:00.000Z");
    expect(Date.parse(r.to)).toBeGreaterThan(now.getTime());
  });
});

describe("formatting", () => {
  it("rounds shares to whole percents and has no share of nothing", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(0, 0)).toBeNull();
  });

  it("formats seconds as m:ss or h:mm:ss", () => {
    expect(formatSeconds(83)).toBe("1:23");
    expect(formatSeconds(725)).toBe("12:05");
    expect(formatSeconds(3723)).toBe("1:02:03");
    expect(formatSeconds(null)).toBe("—");
    expect(formatSeconds(Number.NaN)).toBe("—");
  });

  it("describes a breakdown biggest first and folds the tail", () => {
    expect(describeBreakdown({ "iOS Safari": 12, "Android app": 9, "macOS Chrome": 3, Windows: 2, Linux: 1, Other: 1 }, 3)).toBe("iOS Safari 12 · Android app 9 · macOS Chrome 3 · other 4");
    expect(describeBreakdown({})).toBe("—");
  });
});

describe("clue hardness", () => {
  it("is zero for a clue nobody focused", () => {
    expect(clueHardness(clue({ attempts: 0, solves: 0, median_solve_seconds: null, avg_solve_seconds: null }))).toBe(0);
  });

  it("grows with time, wrong letters and unsolved focuses", () => {
    const easy = clue({});
    const slow = clue({ median_solve_seconds: 60, avg_solve_seconds: 70 });
    const sloppy = clue({ wrong_letters: 20 });
    const abandoned = clue({ unsolved: 5, solves: 5 });
    expect(clueHardness(slow)).toBeGreaterThan(clueHardness(easy));
    expect(clueHardness(sloppy)).toBeGreaterThan(clueHardness(easy));
    expect(clueHardness(abandoned)).toBeGreaterThan(clueHardness(easy));
  });

  it("falls back to the average when there is no median", () => {
    expect(clueHardness(clue({ median_solve_seconds: null, avg_solve_seconds: 40 }))).toBe(40);
  });

  it("ranks hardest first and drops clues with no attempts", () => {
    const rows = [
      clue({ clue: "3D", attempts: 0, solves: 0 }),
      clue({ clue: "1A" }),
      clue({ clue: "7A", median_solve_seconds: 90 }),
      clue({ clue: "2D", wrong_letters: 30 }),
    ];
    expect(hardestClues(rows).map((c) => c.clue)).toEqual(["7A", "2D", "1A"]);
  });

  it("orders clue ids across before down, numerically", () => {
    expect(["10A", "2D", "1A", "1D", "3A"].sort(compareClueIds)).toEqual(["1A", "3A", "10A", "1D", "2D"]);
  });
});

describe("summarize", () => {
  it("adds up every puzzle row", () => {
    const row = (over: Partial<PuzzleInsight>): PuzzleInsight => ({
      puzzle_key: "k",
      puzzle_title: "T",
      width: 15,
      height: 15,
      opens: 10,
      attempted: 8,
      solves: 4,
      median_active_seconds: 600,
      solo: 7,
      multiplayer: 3,
      signed_in: 2,
      by_client: { web: 10 },
      by_platform: { "iOS Safari": 6, "macOS Chrome": 4 },
      by_source: { daily: 10 },
      narrator_connected: 1,
      narrator_failed: 1,
      last_played: "2026-10-16T00:00:00Z",
      ...over,
    });
    const s = summarize([row({}), row({ puzzle_key: "k2", opens: 5, attempted: 5, solves: 5, signed_in: 0, by_platform: { "iOS Safari": 5 }, narrator_connected: 0, narrator_failed: 0 })]);
    expect(s).toEqual({ opens: 15, attempted: 13, solves: 9, signedIn: 2, narratorConnected: 1, narratorFailed: 1, byPlatform: { "iOS Safari": 11, "macOS Chrome": 4 } });
  });
});
