import { describe, it, expect } from "vitest";
import { nextUpSuggestions, unsolvedDailies } from "./nextUp";
import { puzzleIdentity } from "./soloStats";
import type { DailyMini } from "./dailyMinis";
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

const y = (slot: "mini" | "midi" | "large", identity: string) => ({
  day: "2026-10-19",
  slot,
  title: `Y ${slot}`,
  theme: "",
  author: "",
  width: 5,
  height: 5,
  clues: 10,
  identity,
  blocks: "",
});

describe("unsolvedDailies", () => {
  it("keeps slot order mini → midi → large and skips solved, finished, unknown and absent slots", () => {
    const rows = unsolvedDailies({ mini, midi, large }, {}, null);
    expect(rows.map((r) => r.slot)).toEqual(["mini", "midi", "large"]);

    expect(unsolvedDailies({ mini, midi, large }, { [key(midi)]: 40 }, key(mini)).map((r) => r.slot)).toEqual(["large"]);
    expect(unsolvedDailies({ mini, midi: undefined, large: null }, {}).map((r) => r.slot)).toEqual(["mini"]);
  });
});

describe("nextUpSuggestions", () => {
  it("offers at most two unsolved dailies, in order, after a finish", () => {
    const items = nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: {}, finishedKey: key(mini) });
    expect(items).toEqual([
      { kind: "daily", slot: "midi", daily: midi },
      { kind: "daily", slot: "large", daily: large },
    ]);
  });

  it("offers yesterday's unsolved dailies after today's, in slot order, and never a solved or just-finished one", () => {
    const yesterday = [y("large", "yl"), y("mini", "ym"), y("midi", "yd")];
    // Today's mini and midi are solved; the large is open, then yesterday fills the second row.
    const items = nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: { [key(mini)]: 60, [key(midi)]: 90, yd: 100 }, yesterday });
    expect(items).toEqual([
      { kind: "daily", slot: "large", daily: large },
      { kind: "archive", entry: yesterday[1] },
    ]);
    // Every daily today done: yesterday's open ones, mini → large, skipping the one just finished.
    const all = { [key(mini)]: 1, [key(midi)]: 1, [key(large)]: 1 };
    expect(nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: all, yesterday, finishedKey: "ym" }).map((i) => (i.kind === "archive" ? i.entry.identity : i.kind))).toEqual(["yd", "yl"]);
  });

  it("caps at `max`", () => {
    const items = nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: {}, max: 1 });
    expect(items).toEqual([{ kind: "daily", slot: "mini", daily: mini }]);
    expect(nextUpSuggestions({ dailies: { mini }, bestTimes: {}, max: 0 })).toEqual([]);
  });

  it("is empty once every daily is done, with yesterday unknown or exhausted", () => {
    const all = { [key(mini)]: 1, [key(midi)]: 1, [key(large)]: 1 };
    expect(nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: all, yesterday: null })).toEqual([]);
    expect(nextUpSuggestions({ dailies: { mini, midi, large }, bestTimes: { ...all, ym: 1 }, yesterday: [y("mini", "ym")] })).toEqual([]);
    // A slot with nothing today counts as done.
    expect(nextUpSuggestions({ dailies: { mini, midi: null, large: null }, bestTimes: {}, finishedKey: key(mini) })).toEqual([]);
  });
});
