import { describe, expect, it } from "vitest";
import { modePreviewFrame, PREVIEW_CELLS, PREVIEW_LOOP, PREVIEW_ROWS, PREVIEW_SIZE } from "./modePreview";

describe("modePreviewFrame", () => {
  it("uses a word square: every column reads the same as its row", () => {
    for (let i = 0; i < PREVIEW_SIZE; i++) {
      expect(PREVIEW_ROWS.map((row) => row[i]).join("")).toBe(PREVIEW_ROWS[i]);
    }
  });

  it("starts empty and wraps at the loop length", () => {
    for (const mode of ["versus", "coop", "async", "ghost"] as const) {
      const first = modePreviewFrame(mode, 0);
      expect(first.cells.every((c) => c.by === null && !c.dot)).toBe(true);
      expect(first.counts).toEqual([0, 0]);
      expect(modePreviewFrame(mode, PREVIEW_LOOP + 5)).toEqual(modePreviewFrame(mode, 5));
    }
  });

  it("a shared grid fills one square a step, split between both players", () => {
    for (const mode of ["versus", "coop"] as const) {
      for (let s = 0; s <= PREVIEW_CELLS; s++) {
        const f = modePreviewFrame(mode, s);
        expect(f.counts[0] + f.counts[1]).toBe(s);
        expect(f.cells.filter((c) => c.by !== null)).toHaveLength(s);
      }
      const full = modePreviewFrame(mode, PREVIEW_CELLS);
      expect(full.done).toBe(true);
      expect(full.counts).toEqual([9, 7]);
      // Held full until the loop restarts.
      expect(modePreviewFrame(mode, PREVIEW_LOOP - 1)).toEqual(full);
    }
  });

  it("your own copy holds only your letters; the friend is slower", () => {
    for (let s = 0; s <= PREVIEW_CELLS; s++) {
      const f = modePreviewFrame("async", s);
      expect(f.cells.every((c) => c.by !== 1)).toBe(true);
      expect(f.counts[0]).toBe(s);
      expect(f.counts[1]).toBeLessThanOrEqual(s);
    }
    expect(modePreviewFrame("async", PREVIEW_CELLS).counts[1]).toBeLessThan(PREVIEW_CELLS);
  });

  it("an own-copy race marks the friend's squares with dots on your grid, live or recorded", () => {
    for (const mode of ["async", "ghost"] as const) {
      const mid = modePreviewFrame(mode, 8);
      expect(mid.cells.filter((c) => c.dot)).toHaveLength(mid.counts[1]);
      expect(mid.counts[1]).toBeGreaterThan(0);
      // A dot can sit on a square you have not reached.
      expect(mid.cells.some((c) => c.dot && c.by === null)).toBe(true);
      expect(mid.cells.every((c) => c.by !== 1)).toBe(true);
    }
  });
});
