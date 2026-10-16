import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { initSync, Engine } from "./wasm/seedgrid_engine";
import { IngridEngine } from "./ingrid";
import { gridStats, gridToRows, slotsOf } from "./grid";
import { blackBlocks, blackCorners } from "./layout";
import { findSkeleton } from "./skeletonFinder";
import { MAX_SHARED } from "./engineClient";
import { mulberry32 } from "./random";

const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
// A 9k-word slice of the production list plus the words of real fills (scripts/seedgrid/build-fixture-dict.mts).
const FIXTURE = here("./__fixtures__/words.dict");
// The full studio list is built locally (`pnpm seedgrid:studio-dict`) and gitignored; opt in with SEEDGRID_PRODUCTION_DICT=1.
const PRODUCTION = here("../../../public/seedgrid/words-production.dict");
const FOOTBALL = ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "KICKOFFSPRING", "GOALLINEDANCE"];

let wasmLoaded = false;
function loadEngine(dict: string): IngridEngine {
  if (!wasmLoaded) {
    initSync({ module: fs.readFileSync(here("./wasm/seedgrid_engine_bg.wasm")) });
    wasmLoaded = true;
  }
  return new IngridEngine(new Engine(fs.readFileSync(dict, "utf8"), MAX_SHARED, 21));
}

function expectFootballLayout(engine: IngridEngine, budgetMs: number, seed = 1) {
  const res = findSkeleton(engine, { size: 15, symmetry: "rotational", seeds: FOOTBALL, rules: { minScore: 50 }, attempts: 60 }, { random: mulberry32(seed), budgetMs });
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
  expect(res.attempts).toBeGreaterThan(0);
  // Fillable at the reported floor, which may sit a step below the request.
  expect(res.minScore).toBeLessThanOrEqual(50);
  expect(res.minScore).toBeGreaterThanOrEqual(40);
  expect(engine.fill(grid, { minScore: res.minScore }, { timeoutMs: 10_000, seed: 1 }).ok).toBe(true);
}

describe("findSkeleton with the fixture word list", () => {
  let engine: IngridEngine;
  beforeAll(() => {
    engine = loadEngine(FIXTURE);
  });

  it("lays out a 9×9 midi around two 8s (they only fit crossing each other)", () => {
    const res = findSkeleton(engine, { size: 9, symmetry: "rotational", seeds: ["STARFISH", "DEVILRAY"], rules: { minScore: 50 }, attempts: 60 }, { random: mulberry32(1), budgetMs: 10_000 });
    expect(res.grid).not.toBeNull();
    expect(res.minScore).toBeGreaterThanOrEqual(40);
    expect(blackBlocks(res.grid!)).toEqual([]);
    expect(gridToRows(res.grid!).join("\n")).toMatch(/STARFISH/);
  }, 20_000);

  it("lays out a rotational 15×15 around four long themers with white corners and no 2×2 block", () => {
    // The finder slices its budget into stages, and CI runs the engine ~3× slower than a laptop:
    // a 20 s budget gives up there before the paired placements are reached (~5 s locally).
    expectFootballLayout(engine, 60_000);
  }, 90_000);

  it("reports zero attempts when no legal layout holds the seeds", () => {
    // Three 14s cannot pair under rotational symmetry, and no free layout of a 15×15 holds them apart.
    const res = findSkeleton(engine, { size: 15, symmetry: "rotational", seeds: ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "HALFTIMESHOWSS"], rules: { minScore: 50 }, attempts: 20 }, { random: mulberry32(1), budgetMs: 5_000 });
    expect(res.grid).toBeNull();
    expect(res.minScore).toBe(50);
  }, 20_000);
});

describe.skipIf(!process.env.SEEDGRID_PRODUCTION_DICT || !fs.existsSync(PRODUCTION))("findSkeleton with the production word list", () => {
  it("lays out the football set with the full list", () => {
    expectFootballLayout(loadEngine(PRODUCTION), 60_000);
  }, 90_000);
});
