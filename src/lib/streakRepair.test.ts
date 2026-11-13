// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient", () => ({ supabase: null }));
const { repairOfferFromRows, repairOfferFromStats, repairedStreak, repairLocalStreak, repairRow } = await import("./streakRepair");
const { loadSoloStats, recordSoloCompletion, saveSoloStats } = await import("./soloStats");
const { streakFromDays } = await import("./solveHistory");

const day = (d: string) => ({ mode: "solo" as const, source: "daily" as const, completed_day: d });

beforeEach(() => localStorage.clear());

describe("repair offers from an account's history", () => {
  it("offers yesterday when it was missed right after a streak, with the streak it saves", () => {
    expect(repairOfferFromRows([day("2026-11-08"), day("2026-11-09"), day("2026-11-10")], "2026-11-12")).toEqual({ day: "2026-11-11", streak: 3 });
    // Played today already (the repair solve, or anything): still on offer.
    expect(repairOfferFromRows([day("2026-11-10"), day("2026-11-12")], "2026-11-12")).toEqual({ day: "2026-11-11", streak: 1 });
  });

  it("offers nothing when yesterday counts, two days were missed, or there was no streak", () => {
    expect(repairOfferFromRows([day("2026-11-10"), day("2026-11-11")], "2026-11-12")).toBeNull();
    expect(repairOfferFromRows([day("2026-11-09")], "2026-11-12")).toBeNull();
    expect(repairOfferFromRows([], "2026-11-12")).toBeNull();
  });

  it("makes the missed day count with a marker row, which the streak then runs through", () => {
    const row = repairRow("2026-11-11", "abc123", "2026-11-12T10:00:00Z");
    expect(row).toMatchObject({ puzzle_key: "repair:abc123", mode: "import", source: "daily", seconds: null, completed_day: "2026-11-11" });
    expect(streakFromDays(["2026-11-09", "2026-11-10", row.completed_day, "2026-11-12"]).current).toBe(4);
  });
});

describe("repair on a device without an account", () => {
  it("offers and repairs a streak not played since the break", () => {
    const stats = { streak: { current: 5, longest: 5, lastPlayedDay: "2026-11-10" } };
    expect(repairOfferFromStats(stats, "2026-11-12")).toEqual({ day: "2026-11-11", streak: 5 });
    expect(repairedStreak(stats, "2026-11-12")).toEqual({ current: 6, longest: 6, lastPlayedDay: "2026-11-11" });
  });

  it("remembers the broken run when today's first finish rolls it back, and restores it with today included", () => {
    saveSoloStats({ version: 1, bestTimes: {}, streak: { current: 5, longest: 9, lastPlayedDay: "2026-11-10" }, nytStreak: { current: 0, longest: 0, lastPlayedDay: null } });
    const today = new Date(2026, 10, 12, 9);
    expect(recordSoloCompletion("k", 60, today).streak.current).toBe(1);
    expect(loadSoloStats().streakBreak).toEqual({ day: "2026-11-11", before: 5 });
    expect(repairLocalStreak(today)).toEqual({ current: 7, longest: 9, lastPlayedDay: "2026-11-12" });
    expect(loadSoloStats().streakBreak).toBeUndefined();
    // Nothing more to repair.
    expect(repairLocalStreak(today)).toBeNull();
  });

  it("forgets the break once its day has passed", () => {
    saveSoloStats({ version: 1, bestTimes: {}, streak: { current: 5, longest: 5, lastPlayedDay: "2026-11-10" }, nytStreak: { current: 0, longest: 0, lastPlayedDay: null } });
    recordSoloCompletion("k", 60, new Date(2026, 10, 12, 9));
    recordSoloCompletion("k2", 60, new Date(2026, 10, 13, 9));
    expect(loadSoloStats().streakBreak).toBeUndefined();
    expect(repairOfferFromStats(loadSoloStats(), "2026-11-13")).toBeNull();
  });
});
