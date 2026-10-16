import { describe, it, expect } from "vitest";
import { gridFromRows, gridStats, gridToRows, slotsOf } from "./grid";
import { blackBlocks, blackCorners, placeSeeds } from "./layout";
import { enumerateSkeletons, linePatterns, rulePenalty, searchSkeleton, type Heat } from "./skeletonSearch";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FOOTBALL = ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "KICKOFFSPRING", "GOALLINEDANCE"];
const show = (p: boolean[]) => p.map((b) => (b ? "#" : ".")).join("");

describe("linePatterns", () => {
  it("lists every legal way to black out a line", () => {
    const free = linePatterns(Array(7).fill(false), Array(7).fill(false), 7);
    expect(free.map(show)).toContain(".......");
    expect(free.map(show)).toContain("...#...");
    expect(free.map(show)).not.toContain("..#....");
    expect(free.map(show)).not.toContain("#..#...");
    expect(free.map(show)).toContain("#......");
  });

  it("keeps locked cells white, frozen cells black, and lets only a theme entry run long", () => {
    const locked = Array(15).fill(false);
    for (const r of [3, 5, 9, 11]) locked[r] = true;
    const col = linePatterns(locked, Array(15).fill(false), 7, 4);
    expect(col.length).toBeGreaterThan(0);
    for (const p of col) {
      for (const r of [3, 5, 9, 11]) expect(p[r]).toBe(false);
      expect(show(p)).not.toMatch(/#{5}/);
    }
    const seedRow = linePatterns(Array(15).fill(false).map((_, i) => i >= 1), [true, ...Array(14).fill(false)], 7);
    expect(seedRow.map(show)).toEqual(["#.............."]);
    expect(linePatterns(Array(15).fill(false), Array(15).fill(false), 7).every((p) => !/^\.{8}|\.{8}$/.test(show(p)))).toBe(true);
  });
});

describe("rulePenalty", () => {
  it("is zero for a legal grid and charges structure far more than long runs", () => {
    const legal = gridFromRows(["#....", ".....", ".....", ".....", "....#"]);
    expect(rulePenalty(legal, "rotational", 0.3, 5)).toBe(0);
    expect(rulePenalty(gridFromRows(["....#", ".....", "..#..", ".....", "#...."]), "rotational", 0.3, 5)).toBeGreaterThanOrEqual(4000);
    const long = gridFromRows(["...............", "...............", "...............", "...............", "...............", "...............", "...............", "...............", "...............", "...............", "...............", "...............", "...............", "...............", "..............."]);
    const longPen = rulePenalty(long, "rotational", 0.26, 7);
    expect(longPen).toBeGreaterThan(0);
    const corner = gridFromRows(long.cells.length ? gridToRows(long) : []);
    corner.cells[0] = "#";
    corner.cells[corner.cells.length - 1] = "#";
    expect(rulePenalty(corner, "rotational", 0.26, 7)).toBeGreaterThan(longPen + 1000);
  });
});

describe("enumerateSkeletons", () => {
  it("builds legal skeletons around paired long seeds, with white corners and no 2×2 blocks", () => {
    const random = rng(2);
    let found = 0;
    for (let i = 0; i < 12 && found < 3; i++) {
      const placed = placeSeeds({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random })!;
      for (const grid of enumerateSkeletons(placed.grid, { symmetry: "rotational", random, limit: 4 })) {
        found++;
        const stats = gridStats(grid);
        expect(stats.shortRuns).toBe(0);
        expect(stats.connected).toBe(true);
        expect(stats.blockPct).toBeLessThanOrEqual(0.26);
        expect(blackCorners(grid)).toEqual([]);
        expect(blackBlocks(grid)).toEqual([]);
        expect(rulePenalty(grid, "rotational", 0.26, 7)).toBe(0);
        // Seeds survive untouched, with a black at each end.
        expect(gridToRows(grid).join("\n")).toMatch(/GOALPOSTMALONE/);
        expect(slotsOf(grid).filter((s) => s.cells.every((c) => grid.locked[c]))).toHaveLength(4);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("returns nothing for a placement no legal grid can hold", () => {
    // Two 8s at rows 3 and 5 of a 9×9 leave every crossing column without a legal shape at run length 6.
    const g = gridFromRows(["?????????", "?????????", "?????????", "STARFISH#", "?????????", "#DEVILRAY", "?????????", "?????????", "?????????"].map((r) => r.replace(/\?/g, ".")));
    g.locked = g.cells.map((c) => /[A-Z]/.test(c));
    expect(enumerateSkeletons(g, { symmetry: "rotational", random: rng(1), limit: 2, maxRunLength: 6 })).toEqual([]);
  });
});

describe("searchSkeleton", () => {
  it("walks a legal skeleton toward a better heatmap and probes the best", () => {
    const random = rng(4);
    const placed = placeSeeds({ size: 15, symmetry: "rotational", seeds: FOOTBALL, random })!;
    const [start] = enumerateSkeletons(placed.grid, { symmetry: "rotational", random, limit: 1 });
    expect(start).toBeDefined();
    // A stand-in heatmap: every free slot has as many options as it is short, and a 3-letter slot wins the probe.
    const heat = (grid: Parameters<typeof rulePenalty>[0]): Heat => ({
      ok: true,
      counts: Object.fromEntries(slotsOf(grid).map((s) => [s.id, Math.max(1, 9 - s.cells.length)])),
    });
    let probes = 0;
    const res = searchSkeleton(start, {
      symmetry: "rotational",
      random,
      minScore: 50,
      heat,
      probe: (grid) => {
        probes++;
        return gridStats(grid).threes >= 10;
      },
      steps: 300,
    });
    expect(probes).toBeGreaterThan(0);
    expect(res.probes).toBe(probes);
    const got = res.grid ?? res.best;
    expect(got).not.toBeNull();
    expect(rulePenalty(got!, "rotational", 0.26, 7)).toBe(0);
    expect(blackCorners(got!)).toEqual([]);
    expect(blackBlocks(got!)).toEqual([]);
  });
});
