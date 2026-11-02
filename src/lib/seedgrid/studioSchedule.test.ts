import { describe, it, expect, vi, afterEach } from "vitest";
import { gridFromRows } from "./grid";
import { initialStudioState, type StudioState } from "./studioState";
import { defaultSlotFor, fetchStockedDays, monthsBetween, scheduleEntry, scheduleProblems, servingFor, upcomingDays } from "./studioSchedule";
import { parseDailyFeedEntry } from "../dailyFeed";

const CLUES = {
  "0:across:3": "Cave flier",
  "3:across:3": "Mined rock",
  "6:across:3": "Got hitched",
  "0:down:3": "Archery gear",
  "1:down:3": "Exist",
  "2:down:3": "Talk giver's org.",
};
const ready = (): StudioState => ({ ...initialStudioState(3, "p-1"), grid: gridFromRows(["BAT", "ORE", "WED"]), title: "Tiny", clues: { ...CLUES } });

describe("daily queue", () => {
  it("lists upcoming local days across a month end", () => {
    expect(upcomingDays(new Date(2026, 9, 30, 23, 0), 3)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("explains what a puzzle still needs before it can be a daily", () => {
    expect(scheduleProblems(ready())).toEqual([]);
    const draft = { ...ready(), title: "", clues: { ...CLUES, "0:across:3": "", "6:across:3": "Wed, briefly" } };
    expect(scheduleProblems(draft)).toEqual(["Give it a title.", "Clue 1A, 5A."]);
    expect(scheduleProblems({ ...ready(), grid: gridFromRows(["BA.", "ORE", "WED"]) })[0]).toBe("Fill every square.");
  });

  it("files 15×15s under the large slot, 9×9s under the midi and minis under the mini", () => {
    expect(defaultSlotFor(15, 15)).toBe("large");
    expect(defaultSlotFor(11, 11)).toBe("large");
    expect(defaultSlotFor(9, 9)).toBe("midi");
    expect(defaultSlotFor(7, 9)).toBe("midi");
    expect(defaultSlotFor(5, 5)).toBe("mini");
    expect(defaultSlotFor(7, 7)).toBe("mini");
  });

  it("builds a feed entry the app's daily feed accepts", () => {
    const mini = parseDailyFeedEntry(JSON.parse(JSON.stringify(scheduleEntry(ready(), " Bats "))));
    expect(mini?.theme).toBe("Bats");
    expect(mini?.puzzle.title).toBe("Tiny");
    expect(mini?.puzzle.clues.find((c) => c.number === 1 && c.direction === "across")).toMatchObject({ text: "Cave flier", answer: "BAT" });
    expect(scheduleEntry(ready(), "").theme).toBeUndefined();
  });
});

describe("what a day will serve", () => {
  const row = { day: "2026-10-30", slot: "mini" as const, title: "Queued", studio_id: "p-9" };

  it("puts a committed file first, then the schedule, then the mini's rotation", () => {
    expect(servingFor("mini", { day: "2026-10-30", slot: "mini", title: "Stocked" }, row)).toEqual({ kind: "file", title: "Stocked", shadowed: row });
    expect(servingFor("mini", { day: "2026-10-30", slot: "mini", title: "Stocked" }, undefined)).toEqual({ kind: "file", title: "Stocked", shadowed: null });
    expect(servingFor("mini", undefined, row)).toEqual({ kind: "scheduled", entry: row });
    expect(servingFor("mini", undefined, undefined)).toEqual({ kind: "rotation" });
    expect(servingFor("large", undefined, undefined)).toEqual({ kind: "none" });
    expect(servingFor("midi", undefined, undefined)).toEqual({ kind: "none" });
  });

  it("spans the months a day range touches", () => {
    expect(monthsBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10", "2026-11"]);
    expect(monthsBetween("2026-12-20", "2027-01-05")).toEqual(["2026-12", "2027-01"]);
    expect(monthsBetween("2026-10-01", "2026-10-14")).toEqual(["2026-10"]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads the stocked files from the index months, future days included, and only the asked range", async () => {
    const entry = (day: string, slot: string, title: string) => ({ day, slot, title, theme: "", author: "", width: 5, height: 5, clues: 10, identity: "x", blocks: "....." });
    const fetch = vi.fn(async (url: string) => ({
      ok: url.includes("2026-10") || url.includes("2026-11"),
      json: async () => (url.includes("2026-10") ? [entry("2026-10-29", "mini", "Old"), entry("2026-10-31", "large", "Halloween")] : [entry("2026-11-01", "midi", "Next")]),
    }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchStockedDays("2026-10-30", "2026-11-12")).resolves.toEqual([
      { day: "2026-10-31", slot: "large", title: "Halloween" },
      { day: "2026-11-01", slot: "midi", title: "Next" },
    ]);
    expect(fetch.mock.calls.map(([u]) => u)).toEqual(["/daily-puzzles/index/2026-10.json", "/daily-puzzles/index/2026-11.json"]);
  });
});
