import { describe, it, expect } from "vitest";
import {
  ANONYMOUS_ARCHIVE_DAYS,
  archiveCounts,
  defaultSelection,
  inProgressFrom,
  isLockedDay,
  deriveArchiveItems,
  groupByDay,
  monthCells,
  resumableIdentity,
  resumableItem,
  shiftMonth,
  weekdayInitials,
  type ArchiveItem,
} from "./archive";
import type { DailyIndexEntry } from "./dailyIndex";
import { puzzleIdentity } from "./soloStats";
import type { Puzzle } from "../types/puzzle";

const entry = (over: Partial<DailyIndexEntry> = {}): DailyIndexEntry => ({
  day: "2026-10-20",
  slot: "mini",
  title: "Taco Tuesday",
  theme: "",
  author: "",
  width: 5,
  height: 5,
  clues: 10,
  identity: "abc",
  blocks: "",
  ...over,
});

const puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells"> = {
  title: "Deep Blue",
  width: 2,
  height: 1,
  cells: [
    [
      { row: 0, col: 0, solution: "A" },
      { row: 0, col: 1, solution: "B" },
    ],
  ],
};
const id = puzzleIdentity(puzzle);
const typed = { "0,0": { letter: "A", correct: true } };
/** An in-progress attempt, as `inProgressFrom` would report it. */
const P = { filled: 3, total: 25, elapsedMs: 61_000, updatedAt: 5 };

describe("resumableIdentity", () => {
  it("is the saved puzzle's identity once something has been typed", () => {
    expect(resumableIdentity({ puzzle, playerCells: typed }, null)).toBe(id);
    expect(resumableIdentity({ puzzle, playerCells: typed }, { key: id, elapsedMs: 5000, completed: false })).toBe(id);
  });

  it("is null with no session, an untouched grid, or a finished clock", () => {
    expect(resumableIdentity(null, null)).toBeNull();
    expect(resumableIdentity({ puzzle, playerCells: {} }, null)).toBeNull();
    expect(resumableIdentity({ puzzle }, null)).toBeNull();
    expect(resumableIdentity({ puzzle, playerCells: typed }, { key: id, elapsedMs: 5000, completed: true })).toBeNull();
  });

  it("ignores a finished clock that belongs to another puzzle", () => {
    expect(resumableIdentity({ puzzle, playerCells: typed }, { key: "other", elapsedMs: 1, completed: true })).toBe(id);
  });
});

describe("deriveArchiveItems", () => {
  const entries = [entry({ identity: "a" }), entry({ identity: "b", slot: "midi" }), entry({ identity: "c", slot: "large" })];

  it("marks solved with the best time, in progress for every started puzzle, unsolved otherwise", () => {
    const out = deriveArchiveItems(entries, { a: 102 }, { b: P, c: { ...P, updatedAt: 9 } });
    expect(out.map((i) => [i.status, i.seconds, i.progress])).toEqual([
      ["solved", 102, null],
      ["inprogress", null, P],
      ["inprogress", null, { ...P, updatedAt: 9 }],
    ]);
    expect(deriveArchiveItems(entries, {}, {})[2]).toMatchObject({ status: "unsolved", progress: null });
  });

  it("solved wins over in progress (a replay of a solved puzzle)", () => {
    expect(deriveArchiveItems(entries, { b: 60 }, { b: P })[1]).toMatchObject({ status: "solved", seconds: 60, progress: null });
  });

  it("keeps every index field", () => {
    expect(deriveArchiveItems([entry({ theme: "Tacos" })], {}, {})[0]).toMatchObject({ day: "2026-10-20", title: "Taco Tuesday", theme: "Tacos" });
  });
});

describe("inProgressFrom", () => {
  const record = { key: "s1", cells: typed, elapsedMs: 4000, updatedAt: 7, filled: 1, total: 25 };

  it("reports every record in the store", () => {
    expect(inProgressFrom({ s1: record }, null, null)).toEqual({ s1: { filled: 1, total: 25, elapsedMs: 4000, updatedAt: 7 } });
  });

  it("adds the legacy saved session when resumable and unknown to the store, with its clock", () => {
    const out = inProgressFrom({}, { puzzle, playerCells: typed }, { key: id, elapsedMs: 9000, completed: false });
    expect(out).toEqual({ [id]: { filled: 1, total: 2, elapsedMs: 9000, updatedAt: 0 } });
    // Another puzzle's clock does not count for it.
    expect(inProgressFrom({}, { puzzle, playerCells: typed }, { key: "other", elapsedMs: 9000, completed: false })[id].elapsedMs).toBe(0);
  });

  it("prefers the store's record over the legacy session, and skips a finished or untouched session", () => {
    const mine = { ...record, key: id };
    expect(inProgressFrom({ [id]: mine }, { puzzle, playerCells: typed }, null)[id].updatedAt).toBe(7);
    expect(inProgressFrom({}, { puzzle, playerCells: {} }, null)).toEqual({});
    expect(inProgressFrom({}, { puzzle, playerCells: typed }, { key: id, elapsedMs: 1, completed: true })).toEqual({});
  });
});

describe("archiveCounts / resumableItem / groupByDay", () => {
  const items = deriveArchiveItems(
    [
      entry({ day: "2026-10-19", identity: "a" }),
      entry({ day: "2026-10-20", identity: "b", slot: "large" }),
      entry({ day: "2026-10-20", identity: "c", slot: "mini" }),
      entry({ day: "2026-10-20", identity: "d", slot: "midi" }),
    ],
    { a: 90 },
    { b: P },
  );

  it("counts solved and everything left, in-progress included", () => {
    expect(archiveCounts(items)).toEqual({ total: 4, solved: 1, left: 3 });
    expect(archiveCounts([])).toEqual({ total: 0, solved: 0, left: 0 });
  });

  it("finds the most recently touched in-progress item (then the newest day), or null", () => {
    expect(resumableItem(items)?.identity).toBe("b");
    const several = deriveArchiveItems(
      [entry({ day: "2026-10-18", identity: "x" }), entry({ day: "2026-10-20", identity: "y" }), entry({ day: "2026-10-19", identity: "z" })],
      {},
      { x: { ...P, updatedAt: 50 }, y: { ...P, updatedAt: 10 }, z: { ...P, updatedAt: 50 } },
    );
    expect(resumableItem(several)?.identity).toBe("z");
    expect(resumableItem(deriveArchiveItems([entry()], {}, {}))).toBeNull();
  });

  it("groups by day with each day in slot order", () => {
    const g = groupByDay(items);
    expect([...g.keys()]).toEqual(["2026-10-19", "2026-10-20"]);
    expect(g.get("2026-10-20")!.map((i) => i.slot)).toEqual(["mini", "midi", "large"]);
  });
});

describe("calendar math", () => {
  it("monthCells starts on Sunday, pads both ends to full weeks", () => {
    // October 2026 starts on a Thursday and ends on a Saturday: 4 leading pads, none trailing.
    const oct = monthCells("2026-10");
    expect(oct).toHaveLength(35);
    expect(oct.slice(0, 5)).toEqual([null, null, null, null, "2026-10-01"]);
    expect(oct[34]).toBe("2026-10-31");
    // November 2026 starts on a Sunday and has 30 days: no leading pad, 5 trailing.
    const nov = monthCells("2026-11");
    expect(nov).toHaveLength(35);
    expect(nov[0]).toBe("2026-11-01");
    expect(nov.slice(30)).toEqual([null, null, null, null, null]);
  });

  it("shiftMonth crosses year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("weekdayInitials gives seven narrow names, Sunday first", () => {
    const en = weekdayInitials("en-US");
    expect(en).toHaveLength(7);
    expect(en[0]).toBe("S");
    expect(en[1]).toBe("M");
  });
});

describe("isLockedDay", () => {
  it("locks days ANONYMOUS_ARCHIVE_DAYS or more behind today unless unlocked", () => {
    expect(ANONYMOUS_ARCHIVE_DAYS).toBe(7);
    expect(isLockedDay("2026-10-20", "2026-10-20", false)).toBe(false);
    expect(isLockedDay("2026-10-14", "2026-10-20", false)).toBe(false); // 6 days ago: still open
    expect(isLockedDay("2026-10-13", "2026-10-20", false)).toBe(true); // 7 days ago: locked
    expect(isLockedDay("2026-09-01", "2026-10-20", false)).toBe(true);
    expect(isLockedDay("2026-09-01", "2026-10-20", true)).toBe(false);
  });

  it("never locks an unparseable day", () => {
    expect(isLockedDay("nope", "2026-10-20", false)).toBe(false);
  });
});

describe("defaultSelection", () => {
  const items: Pick<ArchiveItem, "day">[] = [{ day: "2026-09-30" }, { day: "2026-10-19" }, { day: "2026-10-18" }];

  it("opens on today when today has a daily", () => {
    expect(defaultSelection([...items, { day: "2026-10-20" }], "2026-10-20")).toEqual({ day: "2026-10-20", month: "2026-10" });
  });

  it("else on the latest published day, in its month", () => {
    expect(defaultSelection(items, "2026-11-02")).toEqual({ day: "2026-10-19", month: "2026-10" });
  });

  it("is null with nothing published", () => {
    expect(defaultSelection([], "2026-10-20")).toBeNull();
  });
});
