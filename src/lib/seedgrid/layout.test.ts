import { describe, it, expect } from "vitest";
import { emptyGrid, gridFromRows, gridStats, gridToRows, slotsOf, slotText } from "./grid";
import {
  blackBlocks,
  blackCorners,
  buildSkeleton,
  canPair,
  cornersMustBeWhite,
  meetsGridStandards,
  pairedPlacements,
  placeSeeds,
  tryBlock,
} from "./layout";
import { mulberry32 } from "./random";

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
      const [sk] = pairedPlacements({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random: mulberry32(i) }, 1);
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
    const [sk] = pairedPlacements({ size: 15, symmetry: "rotational", seeds: ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "HALFTIMESHOWS"], random: mulberry32(1) }, 1);
    expect(sk).toBeDefined();
    const center = sk.placements.find((p) => p.word === "HALFTIMESHOWS")!;
    expect(center).toMatchObject({ row: 7, col: 1 });
    // A 12 has no centered spot in a 15-wide row, so pairing is impossible.
    expect(pairedPlacements({ size: 15, symmetry: "rotational", seeds: ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "HALFTIMESHOW"], random: mulberry32(1) }, 1)).toEqual([]);
  });

  it("placeSeeds always meets the standards and keeps every seed, paired or free", () => {
    for (let i = 0; i < 10; i++) {
      const sk = placeSeeds({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random: mulberry32(i) });
      expect(sk).not.toBeNull();
      expect(meetsGridStandards(sk!.grid)).toBe(true);
      expect(sk!.placements.map((p) => p.word).sort()).toEqual(FOOTBALL.slice().sort());
    }
  });

  it("enumerates many distinct placements for the engine to screen", () => {
    const all = pairedPlacements({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random: mulberry32(2) }, 200);
    expect(all.length).toBeGreaterThan(20);
    const keys = new Set(all.map((s) => gridToRows(s.grid).join("/")));
    expect(keys.size).toBe(all.length);
    for (const s of all) expect(meetsGridStandards(s.grid)).toBe(true);
    expect(pairedPlacements({ size: 15, symmetry: "none", seeds: FOOTBALL }, 10)).toEqual([]);
  });

  it("mirrors same-length seeds in every paired draw, so no long unthemed slot faces a seed", () => {
    // Star System: two 14s and a centered 15. findSkeleton's stage A asks for "paired" whenever
    // canPair says so, and every such draw must put the 14s in rows r and 14 - r; a free draw once
    // left them in rows 3 and 8, and the engine filled their mirror slots with ENCRYPTEDEMAIL and
    // SHARESABEDWITH.
    const seeds = ["REDCARPETGIANT", "MOONWALKOFFAME", "DARKMATTERDAMON"];
    expect(canPair({ size: 15, symmetry: "rotational", seeds })).toBe(true);
    expect(canPair({ size: 11, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY", "SEAHORSE"] })).toBe(false);
    let draws = 0;
    for (let i = 0; i < 40; i++) {
      // Seeds only (placeSeeds) and the full draw with blacks (buildSkeleton, which fails more often).
      const withBlacks = i % 2 === 1;
      const sk = withBlacks ? buildSkeleton({ size: 15, symmetry: "rotational", seeds, random: mulberry32(i), placement: "paired" }) : placeSeeds({ size: 15, symmetry: "rotational", seeds, random: mulberry32(i), placement: "paired" });
      if (!sk) continue;
      draws++;
      const long = sk.placements.filter((p) => p.word.length === 14);
      expect(long).toHaveLength(2);
      expect(long[0].dir).toBe(long[1].dir);
      const lines = long.map((p) => (p.dir === "across" ? p.row : p.col));
      expect(lines[0] + lines[1]).toBe(14);
      const center = sk.placements.find((p) => p.word === "DARKMATTERDAMON")!;
      expect(center.dir === "across" ? center.row : center.col).toBe(7);
      // Once the blacks are in, nothing but a theme entry (whose mirror is now a theme entry too) runs longer than 7.
      if (withBlacks) for (const s of slotsOf(sk.grid)) if (s.cells.length > 7) expect(s.cells.every((c) => sk.grid.locked[c])).toBe(true);
    }
    expect(draws).toBeGreaterThan(15);
  });

  it("falls back to free placement when the seeds cannot pair", () => {
    // Three 8s and nothing to center them with: the old random draw still applies.
    const sk = placeSeeds({ size: 11, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY", "SEAHORSE"], random: mulberry32(3) });
    if (sk) expect(meetsGridStandards(sk.grid)).toBe(true);
  });
});

describe("buildSkeleton under the standards", () => {
  it("keeps corners white and never leaves a 2×2 block in a 15×15", () => {
    const random = mulberry32(5);
    let built = 0;
    for (let i = 0; i < 200 && built < 3; i++) {
      const sk = buildSkeleton({ size: 15, symmetry: "rotational", seeds: ["SEAHORSE", "STARFISH"], random, maxBlockPct: 0.26, construct: true });
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
    const random = mulberry32(7);
    let sk = null;
    for (let i = 0; i < 100 && !sk; i++) sk = buildSkeleton({ size: 9, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY"], random, construct: true });
    expect(sk).not.toBeNull();
    expect(blackBlocks(sk!.grid)).toEqual([]);
  });
});
