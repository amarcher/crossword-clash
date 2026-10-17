import { describe, it, expect } from "vitest";
import { gridFromRows } from "./grid";
import { initialStudioState, type StudioState } from "./studioState";
import { defaultSlotFor, scheduleEntry, scheduleProblems, upcomingDays } from "./studioSchedule";
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
