import { describe, it, expect } from "vitest";
import { emptyGrid, gridFromRows, gridStats, gridToRows, slotsOf, slotText } from "./grid";
import {
  blackBlocks,
  blackCorners,
  buildSkeleton,
  cornersMustBeWhite,
  meetsGridStandards,
  pairedPlacements,
  placeSeeds,
  tryBlock,
} from "./layout";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FOOTBALL = ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "KICKOFFSPRING", "GOALLINEDANCE"];

describe("grid standards", () => {
  it("finds black corners and 2×2 blocks", () => {
    const g = gridFromRows(["#....", ".....", "..##.", "..##.", "....#"]);
    expect(blackCorners(g)).toEqual([0, 24]);
    expect(blackBlocks(g)).toEqual([12]);
    expect(blackBlocks(gridFromRows(["###..", ".....", ".....", ".....", "....."]))).toEqual([]);
  });

  it("asks for white corners from 11×11 up, never for a 2×2 block", () => {
    expect(cornersMustBeWhite(emptyGrid(9))).toBe(false);
    expect(cornersMustBeWhite(emptyGrid(11))).toBe(true);
    const mini = gridFromRows(["#....", ".....", ".....", ".....", "....#"]);
    expect(meetsGridStandards(mini)).toBe(true);
    const big = emptyGrid(15);
    big.cells[0] = "#";
    expect(meetsGridStandards(big)).toBe(false);
    const block = emptyGrid(9);
    for (const i of [10, 11, 19, 20]) block.cells[i] = "#";
    expect(meetsGridStandards(block)).toBe(false);
  });

  it("tryBlock refuses a black that makes a corner or a 2×2 block", () => {
    const g = emptyGrid(15);
    g.cells[1] = "#";
    g.cells[2] = "#";
    g.cells[3] = "#";
    // Blacking the cell below (1,1)–(1,3)'s row start would pair with (0,1): a 2×2.
    g.cells[15 + 2] = "#";
    expect(tryBlock(g, 15 + 1, "none")).toBeNull();
    expect(tryBlock(emptyGrid(15), 0, "none")).toBeNull();
    // A 9×9 may still take a corner black.
    expect(tryBlock(emptyGrid(9), 0, "rotational")).not.toBeNull();
  });
});

describe("paired seed placement", () => {
  it("lays four long seeds out as two mirrored pairs in a rotational 15×15", () => {
    let placed = 0;
    for (let i = 0; i < 10; i++) {
      const [sk] = pairedPlacements({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random: rng(i) }, 1);
      expect(sk).toBeDefined();
      placed++;
      const { grid, placements } = sk;
      expect(placements).toHaveLength(4);
      expect(placements.every((p) => p.dir === "across")).toBe(true);
      // Same-length seeds sit in mirrored rows, every row at least one apart.
      const rows = placements.map((p) => p.row).sort((a, b) => a - b);
      for (const p of placements) {
        const twin = placements.find((q) => q !== p && q.word.length === p.word.length)!;
        expect(twin.row).toBe(14 - p.row);
        expect(twin.col).toBe(15 - p.col - p.word.length);
      }
      for (let k = 1; k < rows.length; k++) expect(rows[k] - rows[k - 1]).toBeGreaterThanOrEqual(2);
      expect(blackCorners(grid)).toEqual([]);
      expect(blackBlocks(grid)).toEqual([]);
      expect(gridStats(grid).shortRuns).toBe(0);
      const answers = slotsOf(grid).map((s) => slotText(grid, s));
      for (const w of FOOTBALL) expect(answers).toContain(w);
    }
    expect(placed).toBe(10);
  });

  it("centers a lone odd-length seed between the pairs", () => {
    const [sk] = pairedPlacements({ size: 15, symmetry: "rotational", seeds: ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "HALFTIMESHOWS"], random: rng(1) }, 1);
    expect(sk).toBeDefined();
    const center = sk.placements.find((p) => p.word === "HALFTIMESHOWS")!;
    expect(center).toMatchObject({ row: 7, col: 1 });
    // A 12 has no centered spot in a 15-wide row, so pairing is impossible.
    expect(pairedPlacements({ size: 15, symmetry: "rotational", seeds: ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "HALFTIMESHOW"], random: rng(1) }, 1)).toEqual([]);
  });

  it("placeSeeds always meets the standards and keeps every seed, paired or free", () => {
    for (let i = 0; i < 10; i++) {
      const sk = placeSeeds({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random: rng(i) });
      expect(sk).not.toBeNull();
      expect(meetsGridStandards(sk!.grid)).toBe(true);
      expect(sk!.placements.map((p) => p.word).sort()).toEqual(FOOTBALL.slice().sort());
    }
  });

  it("enumerates many distinct placements for the engine to screen", () => {
    const all = pairedPlacements({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random: rng(2) }, 200);
    expect(all.length).toBeGreaterThan(20);
    const keys = new Set(all.map((s) => gridToRows(s.grid).join("/")));
    expect(keys.size).toBe(all.length);
    for (const s of all) expect(meetsGridStandards(s.grid)).toBe(true);
    expect(pairedPlacements({ size: 15, symmetry: "none", seeds: FOOTBALL }, 10)).toEqual([]);
  });

  it("falls back to free placement when the seeds cannot pair", () => {
    // Three 8s and nothing to center them with: the old random draw still applies.
    const sk = placeSeeds({ size: 11, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY", "SEAHORSE"], random: rng(3) });
    if (sk) expect(meetsGridStandards(sk.grid)).toBe(true);
  });
});

describe("buildSkeleton under the standards", () => {
  it("keeps corners white and never leaves a 2×2 block in a 15×15", () => {
    const random = rng(5);
    let built = 0;
    for (let i = 0; i < 200 && built < 3; i++) {
      const sk = buildSkeleton({ size: 15, symmetry: "rotational", seeds: ["SEAHORSE", "STARFISH"], random, maxBlockPct: 0.26 });
      if (!sk) continue;
      built++;
      expect(blackCorners(sk.grid)).toEqual([]);
      expect(blackBlocks(sk.grid)).toEqual([]);
      expect(gridStats(sk.grid).shortRuns).toBe(0);
      expect(gridStats(sk.grid).connected).toBe(true);
    }
    expect(built).toBeGreaterThan(0);
  });

  it("still builds a 9×9 midi around two 8s (corner blacks allowed there)", () => {
    const random = rng(7);
    let sk = null;
    for (let i = 0; i < 100 && !sk; i++) sk = buildSkeleton({ size: 9, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY"], random });
    expect(sk).not.toBeNull();
    expect(blackBlocks(sk!.grid)).toEqual([]);
  });
});
