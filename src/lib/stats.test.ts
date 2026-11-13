import { describe, expect, it } from "vitest";
import { averageByWeekday, calendarWeeks, summarizeSlot, weekdayOf, type DailyResult } from "./stats";

const r = (day: string, seconds: number, fasterThan: number | null = null): DailyResult => ({ day, slot: "mini", seconds, solvers: 10, fasterThan });

describe("stats arithmetic", () => {
  it("summarizes a slot: average, best day, mean share beaten over the days with others", () => {
    const s = summarizeSlot([r("2026-11-09", 60, 0.5), r("2026-11-10", 90, null), r("2026-11-11", 30, 1)]);
    expect(s).toMatchObject({ count: 3, average: 60, fasterThan: 0.75 });
    expect(s.best?.day).toBe("2026-11-11");
    expect(summarizeSlot([])).toEqual({ count: 0, average: null, best: null, fasterThan: null });
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
});
