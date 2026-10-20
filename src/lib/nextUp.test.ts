import { describe, it, expect } from "vitest";
import { firstUnplayedClassic, nextUpSuggestions, unsolvedDailies } from "./nextUp";
import { puzzleIdentity } from "./soloStats";
import type { DailyMini } from "./dailyMinis";
import type { ClassicEntry } from "./classicLibrary";
import type { Puzzle } from "../types/puzzle";

function puzzle(title: string, size: number, letter: string): Puzzle {
  const cells = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => ({ row: r, col: c, solution: letter, number: null, isBlack: false })),
  ) as unknown as Puzzle["cells"];
  return { title, author: "", width: size, height: size, cells, clues: [] } as unknown as Puzzle;
}

const mini: DailyMini = { theme: "Ocean", puzzle: puzzle("Deep Blue", 5, "A") };
const midi: DailyMini = { theme: "Jazz", puzzle: puzzle("Blue Note", 9, "B") };
const large: DailyMini = { theme: "Film", puzzle: puzzle("Reel Deal", 15, "C") };
const key = (d: DailyMini) => puzzleIdentity(d.puzzle);

const classics: ClassicEntry[] = [
  { file: "cwpb1.puz", number: 1, title: "A Soft Beginning", author: "A", width: 11, height: 11, clues: 50, identity: "c1", blurb: "" },
  { file: "cwpb2.puz", number: 2, title: "Second", author: "B", width: 13, height: 13, clues: 60, identity: "c2", blurb: "" },
];

describe("unsolvedDailies", () => {
  it("keeps slot order mini → midi → large and skips solved, finished, unknown and absent slots", () => {
    const rows = unsolvedDailies({ mini, midi, large }, {}, null);
    expect(rows.map((r) => r.slot)).toEqual(["mini", "midi", "large"]);

    expect(unsolvedDailies({ mini, midi, large }, { [key(midi)]: 40 }, key(mini)).map((r) => r.slot)).toEqual(["large"]);
    expect(unsolvedDailies({ mini, midi: undefined, large: null }, {}).map((r) => r.slot)).toEqual(["mini"]);
  });
});

describe("firstUnplayedClassic", () => {
  it("returns the first unplayed classic in book order, or null", () => {
    expect(firstUnplayedClassic(classics, {})?.number).toBe(1);
    expect(firstUnplayedClassic(classics, { c1: 100 })?.number).toBe(2);
    expect(firstUnplayedClassic(classics, { c1: 100 }, "c2")).toBeNull();
  });
});

describe("nextUpSuggestions", () => {
  it("offers at most two unsolved dailies, in order, after a finish", () => {
    const items = nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: {}, finishedKey: key(mini), classics });
    expect(items).toEqual([
      { kind: "daily", slot: "midi", daily: midi },
      { kind: "daily", slot: "large", daily: large },
    ]);
  });

  it("caps at `max`", () => {
    const items = nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: {}, classics, max: 1 });
    expect(items).toEqual([{ kind: "daily", slot: "mini", daily: mini }]);
    expect(nextUpSuggestions({ dailies: { mini }, bestTimes: {}, max: 0 })).toEqual([]);
  });

  it("falls back to one unplayed classic once every daily is done", () => {
    const items = nextUpSuggestions({
      dailies: { mini, midi, large },
      bestTimes: { [key(mini)]: 60, [key(midi)]: 90, c1: 300 },
      finishedKey: key(large),
      classics,
    });
    expect(items).toEqual([{ kind: "classic", entry: classics[1] }]);
  });

  it("falls back to the library when no classic is left, or the manifest is unknown", () => {
    const solved = { [key(mini)]: 60, c1: 1, c2: 2 };
    expect(nextUpSuggestions({ dailies: { mini }, bestTimes: solved, classics })).toEqual([{ kind: "library" }]);
    expect(nextUpSuggestions({ dailies: { mini }, bestTimes: { [key(mini)]: 60 }, classics: null })).toEqual([{ kind: "library" }]);
  });

  it("treats a slot with nothing today as solved for the purpose of the fallback", () => {
    const items = nextUpSuggestions({ dailies: { mini, midi: null, large: null }, bestTimes: {}, finishedKey: key(mini), classics });
    expect(items).toEqual([{ kind: "classic", entry: classics[0] }]);
  });
});
