// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_PROGRESS_RECORDS,
  PROGRESS_KEY,
  clearProgress,
  evictOldest,
  filledCells,
  getProgress,
  inProgressKeys,
  loadProgressStore,
  newestProgress,
  recordProgressCells,
  recordProgressElapsed,
  sanitizeStore,
  whiteCellCount,
  withCells,
  withElapsed,
  withoutProgress,
  type SoloProgressRecord,
  type SoloProgressStore,
} from "./soloProgress";

const cells = { "0,0": { letter: "C", correct: true }, "0,1": { letter: "", correct: false }, "0,2": { letter: "T", correct: false, at: 5 } };
const rec = (key: string, updatedAt: number, over: Partial<SoloProgressRecord> = {}): SoloProgressRecord => ({
  key,
  cells: { "0,0": { letter: "A", correct: true } },
  elapsedMs: 1000,
  updatedAt,
  filled: 1,
  total: 9,
  ...over,
});

describe("filledCells / whiteCellCount", () => {
  it("keeps only cells with a letter", () => {
    expect(Object.keys(filledCells(cells))).toEqual(["0,0", "0,2"]);
    expect(filledCells({})).toEqual({});
  });

  it("counts white cells", () => {
    expect(whiteCellCount({ cells: [[{ row: 0, col: 0, solution: "A" }, { row: 0, col: 1, solution: null }], [{ row: 1, col: 0, solution: "B" }, { row: 1, col: 1, solution: "C" }]] })).toBe(3);
  });
});

describe("withCells", () => {
  it("creates a record from the typed cells and keeps an existing clock", () => {
    const store = withCells({}, "p", cells, 9, 100);
    expect(store.p).toEqual({ key: "p", cells: filledCells(cells), elapsedMs: 0, updatedAt: 100, filled: 2, total: 9 });
    const later = withCells({ p: { ...store.p, elapsedMs: 4000 } }, "p", { "0,0": { letter: "C", correct: true } }, 9, 200);
    expect(later.p).toMatchObject({ filled: 1, elapsedMs: 4000, updatedAt: 200 });
  });

  it("does nothing for a grid with no letter — never creates a record, never wipes one", () => {
    expect(withCells({}, "p", {}, 9)).toEqual({});
    const existing = { p: rec("p", 1) };
    expect(withCells(existing, "p", { "0,0": { letter: "", correct: false } }, 9)).toBe(existing);
  });

  it("evicts the oldest records beyond the cap", () => {
    let store: SoloProgressStore = {};
    for (let i = 0; i < MAX_PROGRESS_RECORDS + 3; i++) store = withCells(store, `k${i}`, cells, 9, i);
    expect(Object.keys(store)).toHaveLength(MAX_PROGRESS_RECORDS);
    expect(store.k0).toBeUndefined();
    expect(store.k2).toBeUndefined();
    expect(store.k3).toBeDefined();
    expect(store[`k${MAX_PROGRESS_RECORDS + 2}`]).toBeDefined();
  });
});

describe("withElapsed / withoutProgress / evictOldest", () => {
  it("updates the clock of an existing record only", () => {
    const store = { p: rec("p", 1) };
    expect(withElapsed(store, "q", 5000)).toBe(store);
    expect(withElapsed(store, "p", 1000, 9)).toBe(store); // unchanged value, no write
    expect(withElapsed(store, "p", 5000.7, 9).p).toMatchObject({ elapsedMs: 5000, updatedAt: 9 });
    expect(withElapsed(store, "p", Number.NaN, 9).p.elapsedMs).toBe(1000);
  });

  it("removes a record and is a no-op for an unknown key", () => {
    const store = { p: rec("p", 1), q: rec("q", 2) };
    expect(Object.keys(withoutProgress(store, "p"))).toEqual(["q"]);
    expect(withoutProgress(store, "zz")).toBe(store);
  });

  it("evictOldest keeps the newest `max`", () => {
    const store = { a: rec("a", 3), b: rec("b", 1), c: rec("c", 2) };
    expect(Object.keys(evictOldest(store, 2)).sort()).toEqual(["a", "c"]);
    expect(evictOldest(store, 5)).toBe(store);
  });
});

describe("inProgressKeys / newestProgress / sanitizeStore", () => {
  it("lists keys and finds the newest", () => {
    const store = { a: rec("a", 3), b: rec("b", 7) };
    expect([...inProgressKeys(store)].sort()).toEqual(["a", "b"]);
    expect(newestProgress(store)?.key).toBe("b");
    expect(newestProgress({})).toBeNull();
  });

  it("drops junk, mismatched keys and non-objects", () => {
    expect(sanitizeStore({ a: rec("a", 1), b: rec("zz", 1), c: "junk", d: { key: "d" } })).toEqual({ a: rec("a", 1) });
    expect(sanitizeStore([])).toEqual({});
    expect(sanitizeStore(null)).toEqual({});
    expect(sanitizeStore("x")).toEqual({});
  });
});

describe("localStorage wrapper", () => {
  beforeEach(() => localStorage.clear());

  it("records cells and the clock, reads one back, and clears it (removing the key when empty)", () => {
    recordProgressCells("p", cells, 9, 100);
    recordProgressElapsed("p", 3000, 200);
    expect(getProgress("p")).toMatchObject({ filled: 2, elapsedMs: 3000, updatedAt: 200 });
    recordProgressElapsed("q", 3000); // no record for q: nothing created
    expect(getProgress("q")).toBeNull();
    clearProgress("p");
    expect(loadProgressStore()).toEqual({});
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it("survives corrupt storage", () => {
    localStorage.setItem(PROGRESS_KEY, "{not json");
    expect(loadProgressStore()).toEqual({});
    recordProgressCells("p", cells, 9);
    expect(getProgress("p")?.filled).toBe(2);
  });
});
