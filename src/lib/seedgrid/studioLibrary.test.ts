import { describe, it, expect } from "vitest";
import { gridFromRows } from "./grid";
import { initialStudioState } from "./studioState";
import { duplicateState, isBlank, LIBRARY_LIMIT, removeEntry, toEntry, upsertEntry } from "./studioLibrary";

const puzzle = (id: string, rows = ["CAT", "#.#", "..."]) => ({ ...initialStudioState(3, id), grid: gridFromRows(rows) });

describe("studio library", () => {
  it("skips untouched grids", () => {
    expect(isBlank(initialStudioState(5, "p"))).toBe(true);
    expect(isBlank({ ...initialStudioState(5, "p"), title: "Idea" })).toBe(false);
    expect(isBlank(puzzle("p"))).toBe(false);
  });

  it("summarizes size and progress", () => {
    expect(toEntry(puzzle("p"), 5)).toMatchObject({ id: "p", width: 3, height: 3, updatedAt: 5, filled: 3 / 7 });
  });

  it("keeps one entry per puzzle, newest first, capped", () => {
    let list = upsertEntry([], toEntry(puzzle("a"), 1));
    list = upsertEntry(list, toEntry(puzzle("b"), 2));
    list = upsertEntry(list, toEntry(puzzle("a"), 3));
    expect(list.map((e) => [e.id, e.updatedAt])).toEqual([["a", 3], ["b", 2]]);
    expect(removeEntry(list, "a").map((e) => e.id)).toEqual(["b"]);
    for (let i = 0; i < LIBRARY_LIMIT + 5; i++) list = upsertEntry(list, toEntry(puzzle(`x${i}`), 10 + i));
    expect(list).toHaveLength(LIBRARY_LIMIT);
    expect(list[0].id).toBe(`x${LIBRARY_LIMIT + 4}`);
  });

  it("duplicates under a new id", () => {
    const copy = duplicateState({ ...puzzle("a"), title: "Deep Deck" }, "b");
    expect(copy).toMatchObject({ id: "b", title: "Deep Deck (copy)" });
    expect(copy.grid.cells).toEqual(puzzle("a").grid.cells);
  });
});
