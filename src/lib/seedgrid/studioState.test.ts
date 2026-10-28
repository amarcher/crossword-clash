import { describe, it, expect } from "vitest";
import { gridFromRows, gridToRows } from "./grid";
import { activeSlot, cellHeat, duplicateEntries, heatLevel, initialStudioState, rulesFor, slotKey, studioReducer, type StudioAction, type StudioState } from "./studioState";

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

  it("arrow moves step one square, onto blacks too, and set the direction", () => {
    const s = run({ ...initialStudioState(5), grid: gridFromRows([".#...", ".....", ".....", ".....", "....."]) }, { type: "MOVE", dRow: 0, dCol: 1 });
    expect(s.cursor).toBe(1);
    expect(s.dir).toBe("across");
    expect(run(s, { type: "MOVE", dRow: -1, dCol: 0 }).cursor).toBe(1);
  });

  it("a black square can be reselected and turned white after the cursor leaves it", () => {
    let s = run(initialStudioState(5), { type: "SET_SYMMETRY", symmetry: "none" }, { type: "TOGGLE_BLOCK", cell: 12 }, { type: "SELECT", cell: 0 });
    expect(s.grid.cells[12]).toBe("#");
    s = run(s, { type: "SELECT", cell: 12 });
    expect(s.cursor).toBe(12);
    s = run(s, { type: "TOGGLE_BLOCK" });
    expect(s.grid.cells[12]).toBe("");
    // By keyboard as well: walk onto a black and toggle it.
    s = run(s, { type: "TOGGLE_BLOCK", cell: 13 }, { type: "SELECT", cell: 11 }, { type: "MOVE", dRow: 0, dCol: 1 }, { type: "MOVE", dRow: 0, dCol: 1 }, { type: "TOGGLE_BLOCK" });
    expect(s.grid.cells[13]).toBe("");
    // Typing on a black does nothing.
    s = run(s, { type: "TOGGLE_BLOCK" }, { type: "TYPE", letter: "a" });
    expect(s.grid.cells[13]).toBe("#");
  });

  it("finds complete entries that repeat a word", () => {
    expect(duplicateEntries(gridFromRows(["BAT", "#.#", "BAT"]))).toEqual(["1A", "3A"]);
    expect(duplicateEntries(gridFromRows(["BAT", "ORE", "WED"]))).toEqual([]);
    expect(duplicateEntries(gridFromRows(["BA.", "#.#", "BA."]))).toEqual([]);
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
    s = run(s, { type: "PLACE_WORD", word: "WORLD" });
    expect(gridToRows(s.grid)[0]).toBe("WORLD");
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

  it("applies drafted clues by slot key and drops them when the slot changes shape", () => {
    let s = run(initialStudioState(5), { type: "APPLY_CLUES", clues: { "0:across:5": { standard: "Greeting", speed: "Hi there" } } });
    expect(s.clues["0:across:5"]).toBe("Greeting");
    expect(s.speedClues["0:across:5"]).toBe("Hi there");
    s = run(s, { type: "SET_SYMMETRY", symmetry: "none" }, { type: "TOGGLE_BLOCK", cell: 4 });
    expect(s.clues).toEqual({});
    expect(s.speedClues).toEqual({});
  });

  it("never lets a draft overwrite a hand-written clue", () => {
    let s = run(initialStudioState(5), { type: "SET_CLUE", key: "0:across:5", clue: "My own clue" });
    expect(s.editedClues).toEqual(["0:across:5"]);
    s = run(s, { type: "APPLY_CLUES", clues: { "0:across:5": { standard: "Claude's", speed: "Fast" }, "0:down:5": { standard: "Down one", speed: "D" } } });
    expect(s.clues).toEqual({ "0:across:5": "My own clue", "0:down:5": "Down one" });
    expect(s.speedClues["0:across:5"]).toBeUndefined();
    // Clearing it hands the slot back to drafting.
    s = run(s, { type: "SET_CLUE", key: "0:across:5", clue: "" }, { type: "APPLY_CLUES", clues: { "0:across:5": { standard: "Claude's", speed: "Fast" } } });
    expect(s.clues["0:across:5"]).toBe("Claude's");
    expect(s.editedClues).toEqual([]);
  });

  it("clearing a clue hands the slot back to drafting even when a draft left a speed clue behind", () => {
    // The clue panel has no speed-clue field any more, so the standard clue alone decides ownership.
    let s = run(initialStudioState(5), { type: "APPLY_CLUES", clues: { "0:across:5": { standard: "Greeting", speed: "Hi there" } } });
    s = run(s, { type: "SET_CLUE", key: "0:across:5", clue: "Hello there" });
    expect(s.editedClues).toEqual(["0:across:5"]);
    expect(s.speedClues["0:across:5"]).toBe("Hi there");
    s = run(s, { type: "SET_CLUE", key: "0:across:5", clue: "" });
    expect(s.editedClues).toEqual([]);
    expect(s.speedClues["0:across:5"]).toBeUndefined();
    s = run(s, { type: "APPLY_CLUES", clues: { "0:across:5": { standard: "Hi", speed: "Hey" } } });
    expect(s.clues["0:across:5"]).toBe("Hi");
    // Picking an offered alternative is a SET_CLUE too: it is the constructor's from then on.
    s = run(s, { type: "SET_CLUE", key: "0:across:5", clue: "Howdy" }, { type: "APPLY_CLUES", clues: { "0:across:5": { standard: "Hi", speed: "Hey" } } });
    expect(s.clues["0:across:5"]).toBe("Howdy");
  });

  it("versions keep clues, and a new puzzle starts clean with its own id", () => {
    let s = run(initialStudioState(5, "p-1"), { type: "PLACE_WORD", word: "HELLO" }, { type: "SET_CLUE", key: "0:across:5", clue: "Greeting" });
    s = run(s, { type: "SAVE_VERSION", name: "v1", at: 1 }, { type: "SET_CLUE", key: "0:across:5", clue: "Hi" });
    s = run(s, { type: "RESTORE_VERSION", index: 0 });
    expect(s.clues["0:across:5"]).toBe("Greeting");
    const fresh = run(s, { type: "NEW_GRID", size: 7, id: "p-2" });
    expect(fresh).toMatchObject({ id: "p-2", clues: {}, versions: [], title: "" });
    expect(fresh.grid.width).toBe(7);
    // Loading fills in fields an older saved puzzle may lack.
    const loaded = run(fresh, { type: "LOAD", state: { ...s, speedClues: undefined } as unknown as StudioState });
    expect(loaded.id).toBe("p-1");
    expect(loaded.speedClues).toEqual({});
  });
});
