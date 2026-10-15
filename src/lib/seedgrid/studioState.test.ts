import { describe, it, expect } from "vitest";
import { gridFromRows, gridToRows } from "./grid";
import { activeSlot, cellHeat, heatLevel, initialStudioState, rulesFor, slotKey, studioReducer, type StudioAction, type StudioState } from "./studioState";

const run = (state: StudioState, ...actions: StudioAction[]) => actions.reduce(studioReducer, state);

describe("studio state", () => {
  it("types letters across, locking them, and erases backwards", () => {
    let s = run(initialStudioState(5), { type: "TYPE", letter: "c" }, { type: "TYPE", letter: "a" }, { type: "TYPE", letter: "t" });
    expect(gridToRows(s.grid)[0]).toBe("CAT..");
    expect(s.grid.locked.slice(0, 3)).toEqual([true, true, true]);
    expect(s.cursor).toBe(3);
    s = run(s, { type: "ERASE" });
    expect(gridToRows(s.grid)[0]).toBe("CA...");
    expect(s.cursor).toBe(2);
  });

  it("clicking the cursor flips direction; blocks follow the symmetry", () => {
    let s = run(initialStudioState(5), { type: "SELECT", cell: 0 });
    expect(s.dir).toBe("down");
    s = run(s, { type: "TOGGLE_BLOCK", cell: 0 });
    expect(gridToRows(s.grid)).toEqual(["#....", ".....", ".....", ".....", "....#"]);
    s = run(s, { type: "SET_SYMMETRY", symmetry: "none" }, { type: "TOGGLE_BLOCK", cell: 24 });
    expect(gridToRows(s.grid)[4]).toBe(".....");
  });

  it("arrow moves skip blacks and set the direction", () => {
    const s = run({ ...initialStudioState(5), grid: gridFromRows([".#...", ".....", ".....", ".....", "....."]) }, { type: "MOVE", dRow: 0, dCol: 1 });
    expect(s.cursor).toBe(2);
    expect(s.dir).toBe("across");
  });

  it("clear fill keeps typed (locked) letters and drops engine letters", () => {
    const filled = gridFromRows(["CAT", "ORE", "WED"]);
    filled.locked[0] = true;
    const s = run({ ...initialStudioState(3), grid: filled }, { type: "CLEAR_FILL" });
    expect(gridToRows(s.grid)).toEqual(["C..", "...", "..."]);
  });

  it("approvals map to slot ids and survive renumbering but not reshaping", () => {
    let s = initialStudioState(5);
    const slot = activeSlot(s)!;
    s = run(s, { type: "TOGGLE_APPROVE", key: slotKey(slot), word: "HELLO" });
    expect(rulesFor(s).approved).toEqual({ "1A": ["HELLO"] });
    // A block elsewhere (no symmetry) leaves 1-Across intact.
    s = run(s, { type: "SET_SYMMETRY", symmetry: "none" }, { type: "TOGGLE_BLOCK", cell: 24 });
    expect(rulesFor(s).approved).toEqual({ "1A": ["HELLO"] });
    // A block inside it changes its shape, so the approval goes.
    s = run(s, { type: "TOGGLE_BLOCK", cell: 4 });
    expect(s.approved).toEqual({});
  });

  it("rejecting a word removes its approvals; approving un-rejects it", () => {
    let s = run(initialStudioState(5), { type: "TOGGLE_APPROVE", key: "0:across:5", word: "HELLO" }, { type: "TOGGLE_REJECT", word: "HELLO" });
    expect(s.approved).toEqual({});
    expect(s.rejected).toEqual(["HELLO"]);
    s = run(s, { type: "TOGGLE_APPROVE", key: "0:across:5", word: "HELLO" });
    expect(s.rejected).toEqual([]);
  });

  it("places a word in the active slot and saves/restores versions", () => {
    let s = run(initialStudioState(5), { type: "PLACE_WORD", word: "HELLO" }, { type: "SAVE_VERSION", name: "v1", at: 1 });
    expect(gridToRows(s.grid)[0]).toBe("HELLO");
    s = run(s, { type: "NEW_GRID", size: 5 });
    expect(gridToRows(s.grid)[0]).toBe(".....");
    s = run(s, { type: "RESTORE_VERSION", index: 0 });
    expect(gridToRows(s.grid)[0]).toBe("HELLO");
  });

  it("heat uses the tightest open entry through each cell", () => {
    const grid = gridFromRows(["AB.", "...", "..."]);
    const heat = cellHeat(grid, { "1A": 0, "1D": 30, "2D": 4, "3D": 12, "4A": 50, "5A": 8 });
    expect(heat[0]).toBe(0);
    expect(heat[4]).toBe(4);
    expect([heatLevel(heat[0]), heatLevel(heat[4]), heatLevel(heat[8]), heatLevel(undefined)]).toEqual(["dead", "tight", "snug", "open"]);
  });
});
