// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  formatDuration,
  puzzleIdentity,
  isNewBest,
  applyBestTime,
  dayKey,
  daysBetween,
  rollStreak,
  effectiveStreak,
  recordSoloCompletion,
  describeRecordedCompletion,
  loadSoloStats,
  saveSoloStats,
  getDisplayStreak,
  getBestTime,
  loadSoloTimer,
  saveSoloTimer,
  clearSoloTimer,
  EMPTY_STREAK,
  type StreakState,
} from "./soloStats";
import type { Puzzle } from "../types/puzzle";

function makePuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    title: "Test Puzzle",
    author: "Author",
    width: 2,
    height: 1,
    cells: [
      [
        { row: 0, col: 0, solution: "A" },
        { row: 0, col: 1, solution: "B" },
      ],
    ],
    clues: [],
    ...overrides,
  };
}

describe("formatDuration", () => {
  it("formats seconds as M:SS", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(272)).toBe("4:32");
    expect(formatDuration(238)).toBe("3:58");
    expect(formatDuration(599)).toBe("9:59");
  });

  it("formats an hour or more as H:MM:SS", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(7325)).toBe("2:02:05");
  });

  it("clamps negatives and floors fractions", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(4.9)).toBe("0:04");
    expect(formatDuration(NaN)).toBe("0:00");
    expect(formatDuration(Infinity)).toBe("0:00");
  });
});

describe("puzzleIdentity", () => {
  it("is stable for the same puzzle", () => {
    expect(puzzleIdentity(makePuzzle())).toBe(puzzleIdentity(makePuzzle()));
  });

  it("ignores title casing and surrounding whitespace", () => {
    expect(puzzleIdentity(makePuzzle({ title: "  test PUZZLE " }))).toBe(
      puzzleIdentity(makePuzzle({ title: "Test Puzzle" })),
    );
  });

  it("differs when dimensions differ", () => {
    expect(puzzleIdentity(makePuzzle({ width: 2 }))).not.toBe(
      puzzleIdentity(makePuzzle({ width: 3 })),
    );
  });

  it("differs when the solution grid differs even with same title and size", () => {
    const a = makePuzzle();
    const b = makePuzzle({
      cells: [
        [
          { row: 0, col: 0, solution: "X" },
          { row: 0, col: 1, solution: "Y" },
        ],
      ],
    });
    expect(puzzleIdentity(a)).not.toBe(puzzleIdentity(b));
  });

  it("produces a compact non-empty string", () => {
    const id = puzzleIdentity(makePuzzle());
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^[0-9a-z]+$/);
  });
});

describe("isNewBest", () => {
  it("treats any positive time as best when no prior record", () => {
    expect(isNewBest(null, 100)).toBe(true);
    expect(isNewBest(undefined, 100)).toBe(true);
  });

  it("detects a faster finish", () => {
    expect(isNewBest(238, 200)).toBe(true);
  });

  it("rejects equal or slower finishes", () => {
    expect(isNewBest(238, 238)).toBe(false);
    expect(isNewBest(238, 300)).toBe(false);
  });

  it("rejects non-positive or non-finite durations", () => {
    expect(isNewBest(null, 0)).toBe(false);
    expect(isNewBest(null, -10)).toBe(false);
    expect(isNewBest(null, NaN)).toBe(false);
  });
});

describe("applyBestTime", () => {
  it("inserts a first record", () => {
    const { bestTimes, best, isNewBest: beat } = applyBestTime({}, "k", 272);
    expect(beat).toBe(true);
    expect(best).toBe(272);
    expect(bestTimes.k).toBe(272);
  });

  it("replaces a slower record and copies the map", () => {
    const original = { k: 272 };
    const { bestTimes, best, isNewBest: beat } = applyBestTime(original, "k", 238);
    expect(beat).toBe(true);
    expect(best).toBe(238);
    expect(bestTimes.k).toBe(238);
    expect(original.k).toBe(272); // not mutated
  });

  it("keeps the existing record when not beaten", () => {
    const original = { k: 238 };
    const { bestTimes, best, isNewBest: beat } = applyBestTime(original, "k", 300);
    expect(beat).toBe(false);
    expect(best).toBe(238);
    expect(bestTimes).toBe(original); // same reference, no copy needed
  });
});

describe("dayKey / daysBetween", () => {
  it("formats a local calendar day", () => {
    expect(dayKey(new Date(2026, 5, 30, 13, 45))).toBe("2026-06-30");
    expect(dayKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("counts whole days across a month boundary", () => {
    expect(daysBetween("2026-06-30", "2026-07-01")).toBe(1);
    expect(daysBetween("2026-06-30", "2026-06-30")).toBe(0);
    expect(daysBetween("2026-06-30", "2026-07-05")).toBe(5);
    expect(daysBetween("2026-06-30", "2026-06-28")).toBe(-2);
  });
});

describe("rollStreak", () => {
  const base: StreakState = { current: 3, longest: 5, lastPlayedDay: "2026-06-29" };

  it("increments on a consecutive day", () => {
    const next = rollStreak(base, "2026-06-30");
    expect(next.current).toBe(4);
    expect(next.longest).toBe(5);
    expect(next.lastPlayedDay).toBe("2026-06-30");
  });

  it("bumps longest when the streak passes it", () => {
    const next = rollStreak({ current: 5, longest: 5, lastPlayedDay: "2026-06-29" }, "2026-06-30");
    expect(next.current).toBe(6);
    expect(next.longest).toBe(6);
  });

  it("does not double-count the same day", () => {
    const next = rollStreak({ ...base, lastPlayedDay: "2026-06-30" }, "2026-06-30");
    expect(next.current).toBe(3);
    expect(next).toEqual({ ...base, lastPlayedDay: "2026-06-30" });
  });

  it("resets to 1 after a gap", () => {
    const next = rollStreak(base, "2026-07-03");
    expect(next.current).toBe(1);
    expect(next.longest).toBe(5);
    expect(next.lastPlayedDay).toBe("2026-07-03");
  });

  it("starts at 1 from an empty streak", () => {
    const next = rollStreak(EMPTY_STREAK, "2026-06-30");
    expect(next).toEqual({ current: 1, longest: 1, lastPlayedDay: "2026-06-30" });
  });

  it("leaves the streak untouched on a backward clock skew or bad date", () => {
    // Clock moved back a day (today < lastPlayedDay) — must NOT nuke to 1.
    expect(rollStreak(base, "2026-06-28")).toEqual(base);
    // Unparseable day key — degrade safely, keep the streak.
    expect(rollStreak(base, "not-a-date")).toEqual(base);
  });
});

describe("effectiveStreak", () => {
  it("is 0 when never played", () => {
    expect(effectiveStreak(EMPTY_STREAK, "2026-06-30")).toBe(0);
  });

  it("keeps the streak alive today and yesterday", () => {
    const s: StreakState = { current: 4, longest: 4, lastPlayedDay: "2026-06-30" };
    expect(effectiveStreak(s, "2026-06-30")).toBe(4);
    expect(effectiveStreak(s, "2026-07-01")).toBe(4);
  });

  it("reports 0 once more than a day has lapsed", () => {
    const s: StreakState = { current: 4, longest: 4, lastPlayedDay: "2026-06-30" };
    expect(effectiveStreak(s, "2026-07-02")).toBe(0);
  });
});

describe("persistence (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips stats", () => {
    saveSoloStats({
      version: 1,
      bestTimes: { k: 238 },
      streak: { current: 2, longest: 3, lastPlayedDay: "2026-06-30" },
    });
    const loaded = loadSoloStats();
    expect(loaded.bestTimes.k).toBe(238);
    expect(loaded.streak.current).toBe(2);
  });

  it("returns empty stats when nothing stored", () => {
    expect(loadSoloStats()).toEqual({ version: 1, bestTimes: {}, streak: { ...EMPTY_STREAK } });
  });

  it("survives corrupted JSON", () => {
    localStorage.setItem("crossword-clash-solo-stats", "{not json");
    expect(loadSoloStats()).toEqual({ version: 1, bestTimes: {}, streak: { ...EMPTY_STREAK } });
  });

  it("records a completion: new best + streak start", () => {
    const today = new Date(2026, 5, 30);
    const res = recordSoloCompletion("k", 272, today);
    expect(res.finishSeconds).toBe(272);
    expect(res.bestSeconds).toBe(272);
    expect(res.isNewBest).toBe(true);
    expect(res.streak.current).toBe(1);
    expect(getBestTime("k")).toBe(272);
  });

  it("records a faster completion as a new best", () => {
    recordSoloCompletion("k", 272, new Date(2026, 5, 30));
    const res = recordSoloCompletion("k", 238, new Date(2026, 6, 1));
    expect(res.isNewBest).toBe(true);
    expect(res.bestSeconds).toBe(238);
    expect(res.streak.current).toBe(2); // consecutive day
  });

  it("exposes previousBest: null on first solve, the beaten time on a record", () => {
    const first = recordSoloCompletion("k", 272, new Date(2026, 5, 30));
    expect(first.isNewBest).toBe(true);
    expect(first.previousBest).toBeNull(); // best-of-one — UI must not celebrate

    const beat = recordSoloCompletion("k", 238, new Date(2026, 6, 1));
    expect(beat.isNewBest).toBe(true);
    expect(beat.previousBest).toBe(272); // the time that was beaten

    const slower = recordSoloCompletion("k", 300, new Date(2026, 6, 2));
    expect(slower.isNewBest).toBe(false);
    expect(slower.previousBest).toBe(238);
  });

  it("keeps the prior best on a slower completion", () => {
    recordSoloCompletion("k", 238, new Date(2026, 5, 30));
    const res = recordSoloCompletion("k", 300, new Date(2026, 6, 1));
    expect(res.isNewBest).toBe(false);
    expect(res.bestSeconds).toBe(238);
  });

  it("does not double-count the streak for two finishes the same day", () => {
    recordSoloCompletion("k", 272, new Date(2026, 5, 30, 9));
    const res = recordSoloCompletion("k2", 100, new Date(2026, 5, 30, 18));
    expect(res.streak.current).toBe(1);
  });

  it("describeRecordedCompletion does not mutate stats", () => {
    recordSoloCompletion("k", 272, new Date(2026, 5, 30));
    const before = loadSoloStats();
    const res = describeRecordedCompletion("k", 272, new Date(2026, 5, 30));
    expect(res.isNewBest).toBe(false);
    expect(res.bestSeconds).toBe(272);
    expect(loadSoloStats()).toEqual(before);
  });

  it("getDisplayStreak reflects the effective streak for today", () => {
    recordSoloCompletion("k", 272, new Date(2026, 5, 30));
    expect(getDisplayStreak(new Date(2026, 5, 30))).toBe(1);
    expect(getDisplayStreak(new Date(2026, 6, 1))).toBe(1); // yesterday → still alive
    expect(getDisplayStreak(new Date(2026, 6, 5))).toBe(0); // lapsed
  });

  it("round-trips the in-progress timer record", () => {
    saveSoloTimer({ key: "k", elapsedMs: 12000, completed: false });
    expect(loadSoloTimer()).toEqual({ key: "k", elapsedMs: 12000, completed: false });
    clearSoloTimer();
    expect(loadSoloTimer()).toBeNull();
  });
});
