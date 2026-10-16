// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { initSync, Engine } from "./wasm/seedgrid_engine";
import { IngridEngine } from "./ingrid";
import { gridStats, gridToRows, slotsOf } from "./grid";
import { blackBlocks, blackCorners } from "./layout";
import { findSkeleton } from "./skeletonFinder";
import { MAX_SHARED } from "./engineClient";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The studio's word list is built locally (`pnpm seedgrid:studio-dict`) and gitignored.
const DICT = decodeURIComponent(new URL("../../../public/seedgrid/words-production.dict", import.meta.url).pathname);
const FOOTBALL = ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "KICKOFFSPRING", "GOALLINEDANCE"];

describe.skipIf(!fs.existsSync(DICT))("findSkeleton with the production word list", () => {
  let engine: IngridEngine;
  beforeAll(() => {
    initSync({ module: fs.readFileSync(decodeURIComponent(new URL("./wasm/seedgrid_engine_bg.wasm", import.meta.url).pathname)) });
    engine = new IngridEngine(new Engine(fs.readFileSync(DICT, "utf8"), MAX_SHARED, 21));
  });

  it("lays out a 9×9 midi around two 8s from the random draws", () => {
    const res = findSkeleton(engine, { size: 9, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY"], rules: { minScore: 50 }, attempts: 60 }, { random: rng(1), budgetMs: 20_000 });
    expect(res.grid).not.toBeNull();
    expect(res.minScore).toBe(50);
    expect(blackBlocks(res.grid!)).toEqual([]);
  }, 30_000);

  it("lays out a rotational 15×15 around four long themers with white corners and no 2×2 block", () => {
    const res = findSkeleton(engine, { size: 15, symmetry: "rotational", seeds: FOOTBALL, rules: { minScore: 50 }, attempts: 60 }, { random: rng(1), budgetMs: 60_000 });
    expect(res.grid).not.toBeNull();
    const grid = res.grid!;
    expect(blackCorners(grid)).toEqual([]);
    expect(blackBlocks(grid)).toEqual([]);
    const stats = gridStats(grid);
    expect(stats.shortRuns).toBe(0);
    expect(stats.connected).toBe(true);
    const rows = gridToRows(grid).join("\n");
    for (const w of FOOTBALL) expect(rows).toContain(w);
    expect(slotsOf(grid).filter((s) => s.cells.every((i) => grid.locked[i]))).toHaveLength(4);
    // Every other square comes back blank for the constructor to fill.
    expect(grid.cells.every((c, i) => c === "#" || grid.locked[i] || c === "")).toBe(true);
    // Fillable at the reported floor, which may sit a step below the request.
    expect(res.minScore).toBeLessThanOrEqual(50);
    expect(res.minScore).toBeGreaterThanOrEqual(40);
    expect(engine.fill(grid, { minScore: res.minScore }, { timeoutMs: 10_000, seed: 1 }).ok).toBe(true);
  }, 90_000);
});
