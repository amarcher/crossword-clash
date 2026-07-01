import { describe, it, expect } from "vitest";
import {
  isTodaysDaily,
  rankEntries,
  shouldReplace,
  todayKey,
  type DailyResultEntry,
} from "./dailyLeaderboard";
import { getDailyMini } from "./dailyMinis";
import { dayKey } from "./soloStats";

function entry(userId: string, seconds: number, mode: "solo" | "race" = "solo"): DailyResultEntry {
  return { userId, displayName: userId, mode, seconds };
}

describe("todayKey", () => {
  it("matches soloStats dayKey for the same moment", () => {
    const d = new Date(2026, 6, 1, 15, 30);
    expect(todayKey(d)).toBe(dayKey(d));
    expect(todayKey(d)).toBe("2026-07-01");
  });
});

describe("isTodaysDaily", () => {
  it("recognizes the daily mini for the same day", () => {
    const now = new Date(2026, 6, 1);
    expect(isTodaysDaily(getDailyMini(now).puzzle, now)).toBe(true);
  });

  it("rejects a different day's mini", () => {
    const today = new Date(2026, 6, 1);
    const tomorrow = new Date(2026, 6, 2);
    expect(isTodaysDaily(getDailyMini(tomorrow).puzzle, today)).toBe(false);
  });

  it("rejects null", () => {
    expect(isTodaysDaily(null)).toBe(false);
  });
});

describe("rankEntries", () => {
  it("ranks by ascending time", () => {
    const ranked = rankEntries([entry("slow", 120), entry("fast", 60), entry("mid", 90)]);
    expect(ranked.map((r) => r.userId)).toEqual(["fast", "mid", "slow"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("uses standard competition ranking for ties (1, 2, 2, 4)", () => {
    const ranked = rankEntries([
      entry("a", 60),
      entry("b", 90),
      entry("c", 90),
      entry("d", 100),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("returns [] for no entries and does not mutate input", () => {
    expect(rankEntries([])).toEqual([]);
    const input = [entry("b", 90), entry("a", 60)];
    rankEntries(input);
    expect(input[0].userId).toBe("b");
  });
});

describe("shouldReplace", () => {
  it("accepts a first result", () => {
    expect(shouldReplace(null, 100)).toBe(true);
  });

  it("accepts only strictly faster times", () => {
    expect(shouldReplace(100, 99)).toBe(true);
    expect(shouldReplace(100, 100)).toBe(false);
    expect(shouldReplace(100, 101)).toBe(false);
  });

  it("rejects negative or non-finite times", () => {
    expect(shouldReplace(null, -5)).toBe(false);
    expect(shouldReplace(null, NaN)).toBe(false);
    expect(shouldReplace(null, Infinity)).toBe(false);
  });
});
