import { describe, it, expect, vi } from "vitest";

// Force the offline path: vitest inherits .env.local, so without this mock the
// I/O helpers would talk to the real Supabase project from unit tests.
vi.mock("./supabaseClient", () => ({ supabase: null }));
import {
  isTodaysDaily,
  mergeOwnResult,
  pendingResultFor,
  rankEntries,
  shouldReplace,
  todayKey,
  updateDailyDisplayName,
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

describe("updateDailyDisplayName", () => {
  it("no-ops offline (supabase not configured)", async () => {
    await expect(
      updateDailyDisplayName("2026-07-05", "user-1", "Andy"),
    ).resolves.toBeUndefined();
  });
});

describe("mergeOwnResult", () => {
  const board = rankEntries([entry("a", 60), entry("b", 90)]);

  it("returns the board untouched without an own finish", () => {
    expect(mergeOwnResult(board, null)).toEqual(board);
    expect(mergeOwnResult(board, undefined)).not.toBe(board);
  });

  it("adds a missing own row and re-ranks", () => {
    const merged = mergeOwnResult(board, entry("me", 75, "race"));
    expect(merged.map((e) => [e.userId, e.rank])).toEqual([
      ["a", 1],
      ["me", 2],
      ["b", 3],
    ]);
    expect(merged[1].mode).toBe("race");
  });

  it("keeps a fetched own row but never a slower time than the finish just made", () => {
    const withMe = rankEntries([entry("a", 60), { ...entry("me", 100), displayName: "Signed" }]);
    const faster = mergeOwnResult(withMe, entry("me", 80));
    expect(faster.find((e) => e.userId === "me")).toMatchObject({ seconds: 80, displayName: "Signed", rank: 2 });
    const slower = mergeOwnResult(withMe, entry("me", 120));
    expect(slower.find((e) => e.userId === "me")).toMatchObject({ seconds: 100, rank: 2 });
  });
});

describe("pendingResultFor", () => {
  const pending = { day: "2026-10-20", slot: "mini" as const, entry: entry("me", 50), settled: Promise.resolve() };
  it("matches only the same day and slot", () => {
    expect(pendingResultFor(pending, "2026-10-20", "mini")).toBe(pending);
    expect(pendingResultFor(pending, "2026-10-20", "midi")).toBeNull();
    expect(pendingResultFor(pending, "2026-10-21", "mini")).toBeNull();
    expect(pendingResultFor(null, "2026-10-20", "mini")).toBeNull();
  });
});
