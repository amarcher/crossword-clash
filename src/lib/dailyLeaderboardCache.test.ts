import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], error: false }));
vi.mock("./supabaseClient", () => {
  // The query builder: every step returns itself, and awaiting it answers.
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    limit: () => Promise.resolve(db.error ? { data: null, error: new Error("down") } : { data: db.rows, error: null }),
  };
  return { supabase: { from: () => query } };
});
import { cachedDailyLeaderboard, clearDailyLeaderboardCache, fetchDailyLeaderboard } from "./dailyLeaderboard";

const row = (user_id: string, seconds: number) => ({ user_id, display_name: user_id, mode: "solo", seconds, autocheck: true });

beforeEach(() => {
  clearDailyLeaderboardCache();
  db.error = false;
  db.rows = [row("a", 30), row("b", 40), row("c", 50)];
});

it("a fetched board is kept for the session, per day and slot", async () => {
  expect(cachedDailyLeaderboard("2026-11-18", "mini")).toBeNull();
  await fetchDailyLeaderboard("2026-11-18", "mini");
  expect(cachedDailyLeaderboard("2026-11-18", "mini")?.map((e) => e.userId)).toEqual(["a", "b", "c"]);
  expect(cachedDailyLeaderboard("2026-11-18", "midi")).toBeNull();
  expect(cachedDailyLeaderboard("2026-11-17", "mini")).toBeNull();
});

it("a failed fetch leaves the last answer in place", async () => {
  await fetchDailyLeaderboard("2026-11-18", "mini");
  db.error = true;
  expect(await fetchDailyLeaderboard("2026-11-18", "mini")).toEqual([]);
  expect(cachedDailyLeaderboard("2026-11-18", "mini")).toHaveLength(3);
});

it("a friends board not fetched yet is drawn from the everyone board, ranked among the friends", async () => {
  await fetchDailyLeaderboard("2026-11-18", "mini");
  expect(cachedDailyLeaderboard("2026-11-18", "mini", 50, ["c", "b"])).toMatchObject([
    { userId: "b", rank: 1 },
    { userId: "c", rank: 2 },
  ]);
  expect(cachedDailyLeaderboard("2026-11-18", "midi", 50, ["c", "b"])).toBeNull();
});
