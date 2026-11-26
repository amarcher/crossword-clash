import { describe, expect, it } from "vitest";
import { averageByWeekday, calendarWeeks, dailyTitled, lastDays, rankedCount, summarizeSlot, weekdayOf, type DailyResult } from "./stats";

const r = (day: string, seconds: number, fasterThan: number | null = null): DailyResult => ({ day, slot: "mini", seconds, solvers: 10, fasterThan });

describe("stats arithmetic", () => {
  it("summarizes a slot: average, best day, mean share beaten over the days with others", () => {
    const s = summarizeSlot([r("2026-11-09", 60, 0.5), r("2026-11-10", 90, null), r("2026-11-11", 30, 1)]);
    expect(s).toMatchObject({ count: 3, average: 60, fasterThan: 0.75 });
    expect(s.best?.day).toBe("2026-11-11");
    expect(summarizeSlot([])).toEqual({ count: 0, average: null, best: null, fasterThan: null });
  });

  it("keeps the last days, today included, and counts the days with someone to be ranked against", () => {
    const all = [r("2026-10-14", 60), r("2026-10-15", 61), r("2026-11-13", 62), r("2026-11-14", 63)];
    expect(lastDays(all, "2026-11-13", 30).map((x) => x.day)).toEqual(["2026-10-15", "2026-11-13"]);
    expect(rankedCount([r("2026-11-09", 60), { ...r("2026-11-10", 60), solvers: 1 }])).toBe(1);
  });

  it("averages by weekday, Monday first", () => {
    expect(weekdayOf("2026-11-09")).toBe(0); // a Monday
    expect(weekdayOf("2026-11-15")).toBe(6); // a Sunday
    const avg = averageByWeekday([r("2026-11-09", 60), r("2026-11-16", 80), r("2026-11-15", 200)]);
    expect(avg).toEqual([70, null, null, null, null, null, 200]);
  });

  it("lays out the calendar in Monday-first week columns ending this week, marking repaired days apart", () => {
    const weeks = calendarWeeks(new Set(["2026-11-09"]), new Set(["2026-11-10"]), "2026-11-12", 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[1][0]).toEqual({ day: "2026-11-09", state: "solved" });
    expect(weeks[1][1].state).toBe("repaired");
    expect(weeks[1][2].state).toBe("none");
    expect(weeks[1][4].state).toBe("future");
    expect(weeks[0][0].day).toBe("2026-11-02");
  });

  it("finds a slow clue's daily by title: the latest one on or before the day it was played", () => {
    const e = (day: string, title: string) => ({ day, slot: "large" as const, title, theme: "", author: "", width: 15, height: 15, clues: 70, identity: day, blocks: "" });
    const index = [e("2026-10-20", "Flow State"), e("2026-11-12", "Flow State"), e("2026-11-13", "Other")];
    expect(dailyTitled(index, "Flow State", "2026-11-01")?.day).toBe("2026-10-20");
    expect(dailyTitled(index, "Flow State", "2026-11-20")?.day).toBe("2026-11-12");
    expect(dailyTitled(index, "Flow State", "2026-10-01")?.day).toBe("2026-10-20");
    expect(dailyTitled(index, "Nope", "2026-11-20")).toBeNull();
  });
});

describe("per-tab head-to-head and calendar", () => {
  const all = [{ friendId: "f", username: "a", played: 9, wins: 5, losses: 4, ties: 0 }];
  it("picks the tab's records, or the all-dailies list from a server without them", async () => {
    const { headToHeadFor } = await import("./stats");
    const bySlot = [
      { friendId: "f", username: "a", slot: "mini" as const, played: 2, wins: 1, losses: 1, ties: 0 },
      { friendId: "f", username: "a", slot: "large" as const, played: 7, wins: 4, losses: 3, ties: 0 },
    ];
    expect(headToHeadFor({ headToHead: all, headToHeadBySlot: bySlot }, "large")).toEqual([bySlot[1]]);
    expect(headToHeadFor({ headToHead: all, headToHeadBySlot: bySlot }, "midi")).toEqual([]);
    expect(headToHeadFor({ headToHead: all, headToHeadBySlot: null }, "midi")).toBe(all);
    expect(headToHeadFor({ headToHead: all }, "mini")).toBe(all);
  });

  it("marks the days a tab's daily was solved or repaired with, and every daily without keys", async () => {
    const { calendarDays } = await import("./stats");
    const rows: Parameters<typeof calendarDays>[0] = [
      { puzzle_key: "m1", mode: "solo", source: "daily", completed_day: "2026-11-01" },
      { puzzle_key: "l1", mode: "solo", source: "daily", completed_day: "2026-11-02" },
      { puzzle_key: "repair:m2", mode: "import", source: "daily", completed_day: "2026-11-03" },
      { puzzle_key: "nyt", mode: "import", source: "nyt", completed_day: "2026-11-04" },
    ];
    expect(calendarDays(rows, new Set(["m1", "m2"]))).toEqual({ solved: new Set(["2026-11-01"]), repaired: new Set(["2026-11-03"]) });
    expect(calendarDays(rows, new Set(["l1"]))).toEqual({ solved: new Set(["2026-11-02"]), repaired: new Set() });
    expect(calendarDays(rows, null)).toEqual({ solved: new Set(["2026-11-01", "2026-11-02"]), repaired: new Set(["2026-11-03"]) });
  });
});
