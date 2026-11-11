import { describe, it, expect, vi } from "vitest";

// Force the offline path: vitest inherits .env.local, so without this mock the
// I/O helpers would talk to the real Supabase project from unit tests.
vi.mock("./supabaseClient", () => ({ supabase: null }));
import {
  boardDay,
  boardPostsFrom,
  leaderboardPath,
  shiftDay,
  withUnpostedTime,
  wouldHaveRanked,
  isTodaysDaily,
  mergeOwnResult,
  pendingResultFor,
  postDailyResult,
  rankEntries,
  shouldReplace,
  signDailyResult,
  todayKey,
  updateDailyDisplayName,
  type DailyResultEntry,
  type PendingDailyResult,
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

  it("carries the own finish's autocheck flag onto the row it replaces", () => {
    const withMe = rankEntries([entry("a", 60), entry("me", 100)]);
    const faster = mergeOwnResult(withMe, { ...entry("me", 80), autocheck: false });
    expect(faster.find((e) => e.userId === "me")).toMatchObject({ seconds: 80, autocheck: false });
    const added = mergeOwnResult(withMe, { ...entry("you", 70), autocheck: false });
    expect(added.find((e) => e.userId === "you")?.autocheck).toBe(false);
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
  const pending: PendingDailyResult = { day: "2026-10-20", slot: "mini", entry: entry("me", 50), gameId: null, posted: true, settled: Promise.resolve() };
  it("matches only the same day and slot", () => {
    expect(pendingResultFor(pending, "2026-10-20", "mini")).toBe(pending);
    expect(pendingResultFor(pending, "2026-10-20", "midi")).toBeNull();
    expect(pendingResultFor(pending, "2026-10-21", "mini")).toBeNull();
    expect(pendingResultFor(null, "2026-10-20", "mini")).toBeNull();
  });
});

describe("boardPostsFrom", () => {
  it("posts from the production site and from the native apps only", () => {
    expect(boardPostsFrom("https://crosswordclash.com", false)).toBe(true);
    expect(boardPostsFrom("https://www.crosswordclash.com", false)).toBe(true);
    expect(boardPostsFrom("capacitor://localhost", true)).toBe(true);
    expect(boardPostsFrom("http://localhost", true)).toBe(true);
  });

  it("never posts from a preview deployment, local dev or a look-alike", () => {
    expect(boardPostsFrom("https://crossword-clash-git-x-amarchers-projects.vercel.app", false)).toBe(false);
    expect(boardPostsFrom("http://localhost:5173", false)).toBe(false);
    expect(boardPostsFrom("http://127.0.0.1:4173", false)).toBe(false);
    expect(boardPostsFrom("https://crosswordclash.com.evil.example", false)).toBe(false);
    expect(boardPostsFrom("http://crosswordclash.com", false)).toBe(false);
    expect(boardPostsFrom("", false)).toBe(false);
  });
});

describe("postDailyResult", () => {
  const named = { ...entry("me", 50), displayName: "Andy" };

  it("posts a finish under a real name", async () => {
    const pending = postDailyResult("2026-10-20", "midi", named, "room-1");
    expect(pending).toMatchObject({ day: "2026-10-20", slot: "midi", entry: named, gameId: "room-1", posted: true });
    await expect(pending.settled).resolves.toBeUndefined();
  });

  it("parks a finish under the anonymous default (in any language) unposted", async () => {
    for (const displayName of ["Player", "Jugador", "  ", ""]) {
      const pending = postDailyResult("2026-10-20", "mini", { ...entry("me", 50), displayName });
      expect(pending.posted).toBe(false);
      expect(pending.gameId).toBeNull();
      expect(pending.entry.displayName).toBe(displayName);
      await expect(pending.settled).resolves.toBeUndefined();
    }
  });
});

describe("signDailyResult", () => {
  it("posts a parked finish under the signed name, with a fresh settled promise", async () => {
    const parked = postDailyResult("2026-10-20", "mini", { ...entry("me", 50), displayName: "Player" });
    const signed = signDailyResult(parked, "  Andy ");
    expect(signed).toMatchObject({ posted: true, entry: { ...parked.entry, displayName: "Andy" } });
    expect(signed.settled).not.toBe(parked.settled);
    await expect(signed.settled).resolves.toBeUndefined();
  });

  it("renames a posted finish in place", () => {
    const posted = postDailyResult("2026-10-20", "large", { ...entry("me", 50), displayName: "Andy" }, "room-2");
    const renamed = signDailyResult(posted, "Andrew");
    expect(renamed).toMatchObject({ posted: true, gameId: "room-2", entry: { displayName: "Andrew" } });
    expect(renamed.settled).toBe(posted.settled);
  });

  it("ignores a blank signature", () => {
    const parked = postDailyResult("2026-10-20", "mini", { ...entry("me", 50), displayName: "Player" });
    expect(signDailyResult(parked, "   ")).toBe(parked);
  });
});

describe("past boards", () => {
  const entry = (userId: string, seconds: number) => ({ userId, displayName: userId, mode: "solo" as const, seconds });

  it("leaderboardPath names a past day in the query and leaves today's link bare", () => {
    expect(leaderboardPath("mini")).toBe("/daily/leaderboard");
    expect(leaderboardPath("large", null)).toBe("/daily/leaderboard/large");
    expect(leaderboardPath("mini", "2026-11-05")).toBe("/daily/leaderboard?day=2026-11-05");
    expect(leaderboardPath("midi", "2026-11-05")).toBe("/daily/leaderboard/midi?day=2026-11-05");
  });

  it("boardDay accepts only a real past day, no earlier than the first daily", () => {
    const today = "2026-11-10";
    expect(boardDay("2026-11-05", today, "2026-10-16")).toBe("2026-11-05");
    expect(boardDay("2026-10-16", today, "2026-10-16")).toBe("2026-10-16");
    // Before the index has answered, any past day is taken as asked.
    expect(boardDay("2026-08-01", today)).toBe("2026-08-01");
    for (const bad of [null, undefined, "", "yesterday", "2026-11-5", "2026-02-31", today, "2026-11-11", "2026-10-15"]) {
      expect(boardDay(bad, today, "2026-10-16")).toBeNull();
    }
  });

  it("shiftDay moves by calendar days across months and years", () => {
    expect(shiftDay("2026-11-10", -1)).toBe("2026-11-09");
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("wouldHaveRanked is one past every faster time, a tie sharing the rank", () => {
    const board = [entry("a", 60), entry("b", 90), entry("c", 90)];
    expect(wouldHaveRanked(board, 30)).toEqual({ rank: 1, of: 4 });
    expect(wouldHaveRanked(board, 75)).toEqual({ rank: 2, of: 4 });
    expect(wouldHaveRanked(board, 90)).toEqual({ rank: 2, of: 4 });
    expect(wouldHaveRanked(board, 200)).toEqual({ rank: 4, of: 4 });
    expect(wouldHaveRanked([], 75)).toEqual({ rank: 1, of: 1 });
  });

  it("withUnpostedTime slots the viewer in where they would have placed and changes no posted row", () => {
    const board = rankEntries([entry("a", 60), entry("b", 90)]);
    const shown = withUnpostedTime(board, entry("me", 75));
    expect(shown.map((e) => [e.userId, e.rank, !!e.unposted])).toEqual([["a", 1, false], ["me", 2, true], ["b", 2, false]]);
    // Slower than everyone: last, after a tie's rows.
    expect(withUnpostedTime(board, entry("me", 90)).map((e) => e.userId)).toEqual(["a", "b", "me"]);
    expect(withUnpostedTime(board, entry("me", 10))[0]).toMatchObject({ userId: "me", rank: 1, unposted: true });
    // Already on the board, or no time: the board as it is.
    expect(withUnpostedTime(board, entry("a", 5))).toEqual(board);
    expect(withUnpostedTime(board, null)).toEqual(board);
    expect(withUnpostedTime([], entry("me", 75))).toEqual([{ ...entry("me", 75), rank: 1, unposted: true }]);
  });
});
