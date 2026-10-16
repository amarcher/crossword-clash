/**
 * The studio's "Lay out": a fillable skeleton around the theme entries, found
 * with the fill engine in stages that get more expensive as they go.
 *
 *  A. Random draws (buildSkeleton): enough for most seed sets, and cheap.
 *  B. Constructive skeletons (enumerateSkeletons) around every paired
 *     placement, ranked by the engine's heatmap. Stacked themers only have a
 *     few legal column shapes, which random blacks almost never hit.
 *  C. Annealing (searchSkeleton) from the best-ranked skeletons.
 *  D. The same skeletons at a lower score floor, when the floor itself is what
 *     blocks the fill (a quick look one step down runs before C); the result
 *     says which floor it fills at.
 *
 * Engine-agnostic through SkeletonEngine so tests can run it in Node.
 */
import { cloneGrid, slotsOf, type Grid, type Symmetry } from "./grid";
import type { EngineRules, FillOutcome, SlotOptions } from "./ingrid";
import { buildSkeleton, freePlacements, pairedPlacements } from "./layout";
import { enumerateSkeletons, searchSkeleton } from "./skeletonSearch";

export interface SkeletonEngine {
  options(grid: Grid, rules: EngineRules): SlotOptions;
  fill(grid: Grid, rules: EngineRules, opts: { timeoutMs?: number; seed?: number }): FillOutcome;
}

export interface SkeletonRequest {
  size: number;
  symmetry: Symmetry;
  seeds: string[];
  /** Only the score floor and rejections apply: approvals belong to another grid's slots. */
  rules: Pick<EngineRules, "minScore" | "rejected">;
  /** Random draws to try in stage A. */
  attempts: number;
}

export interface SkeletonResult {
  /** Seeds locked, every other square blank; null when nothing filled. */
  grid: Grid | null;
  /** Skeletons the engine was asked to fill. */
  attempts: number;
  /** The score floor the grid fills at: the requested one, or a step below it. */
  minScore: number;
}

export interface FinderOptions {
  random?: () => number;
  /** Wall-clock budget (default 60 s for 13×13 and up, 20 s below). */
  budgetMs?: number;
  /** Per-probe fill timeout (default 1.5 s, 0.5 s up to 7×7). */
  probeMs?: number;
  /** Floors below the requested one to settle for (default 5 and 10 points lower). */
  floorSteps?: number[];
}

interface Candidate {
  grid: Grid;
  /** The highest floor at which the heatmap is consistent. */
  floor: number;
  /** Tightest free slot there. */
  min: number;
  mean: number;
}

export function findSkeleton(engine: SkeletonEngine, req: SkeletonRequest, opts: FinderOptions = {}): SkeletonResult {
  const random = opts.random ?? Math.random;
  const { size, symmetry, seeds } = req;
  const big = size >= 13;
  const budget = opts.budgetMs ?? (big ? 60_000 : 20_000);
  const probeMs = opts.probeMs ?? (size <= 7 ? 500 : 1500);
  const started = Date.now();
  const deadline = started + budget;
  const target = req.rules.minScore;
  const floors = [...new Set([target, ...(opts.floorSteps ?? [5, 10]).map((d) => Math.max(0, target - d))])].sort((a, b) => b - a);
  // Long unthemed entries belong to the theme, but a 15×15 needs a few 7s to work around stacked themers.
  const maxRun = size <= 7 ? size : big ? 7 : 6;
  let attempts = 0;

  const heat = (grid: Grid, minScore: number) => engine.options(grid, { minScore, rejected: req.rules.rejected });
  const probe = (grid: Grid, minScore: number): boolean => {
    attempts++;
    return engine.fill(grid, { minScore, rejected: req.rules.rejected }, { timeoutMs: probeMs, seed: attempts }).ok;
  };
  const finish = (grid: Grid, minScore: number): SkeletonResult => {
    const out = cloneGrid(grid);
    out.cells = out.cells.map((c, i) => (c === "#" || out.locked[i] ? c : ""));
    return { grid: out, attempts, minScore };
  };
  const rankAt = (grid: Grid, floor: number): { min: number; mean: number } | null => {
    const h = heat(grid, floor);
    if (!h.ok) return null;
    const free = slotsOf(grid).filter((s) => !s.cells.every((i) => grid.locked[i]));
    const counts = free.map((s) => h.counts[s.id] ?? 0);
    return { min: counts.length ? Math.min(...counts) : 0, mean: counts.reduce((a, n) => a + Math.log2(1 + n), 0) / Math.max(1, counts.length) };
  };
  const rank = (grid: Grid): Candidate | null => {
    for (const floor of floors) {
      const r = rankAt(grid, floor);
      if (r) return { grid, floor, ...r };
    }
    return null;
  };
  const candidates: Candidate[] = [];
  /** Ranks a legal skeleton and probes it right away when it looks fillable at the target. */
  const consider = (grid: Grid): SkeletonResult | null => {
    const c = rank(grid);
    if (!c) return null;
    candidates.push(c);
    if (c.floor === target && c.min >= 2 && probe(grid, target)) return finish(grid, target);
    return null;
  };
  const byQuality = (a: Candidate, b: Candidate) => b.floor - a.floor || b.min - a.min || b.mean - a.mean;

  // A. Random symmetric layouts around the seeds.
  for (let attempt = 0; attempt < req.attempts && Date.now() < started + budget / 4; attempt++) {
    const drawn = buildSkeleton({ size, symmetry, seeds, random, maxBlockPct: attempt < req.attempts / 2 ? 0.22 : 0.26, maxRunLength: maxRun });
    if (!drawn) continue;
    const hit = consider(drawn.grid);
    if (hit) return hit;
  }

  // B. Column-by-column skeletons around each way of pairing the seeds, then around free
  // placements (crossings first: two 8s in a 9×9 only work that way).
  const starts = [...pairedPlacements({ size, symmetry, seeds, random }, 48), ...freePlacements({ size, symmetry, seeds, random }, 48)];
  const halfway = started + budget / 2;
  for (const start of starts) {
    if (Date.now() > halfway) break;
    for (const grid of enumerateSkeletons(start.grid, { symmetry, random, limit: 6, maxRunLength: maxRun, deadline: halfway })) {
      const hit = consider(grid);
      if (hit) return hit;
    }
  }

  // D. Settle for a lower floor: the skeletons are sound, the list just runs thin at the target.
  const settle = (floor: number, probes: number): SkeletonResult | null => {
    const pool = candidates
      .map((c) => ({ grid: c.grid, ...(rankAt(c.grid, floor) ?? { min: -1, mean: 0 }) }))
      .filter((c) => c.min >= 1)
      .sort((a, b) => b.min - a.min || b.mean - a.mean)
      .slice(0, probes);
    for (const c of pool) {
      if (Date.now() > deadline) break;
      if (probe(c.grid, floor)) return finish(c.grid, floor);
    }
    return null;
  };
  candidates.sort(byQuality);
  // A quick look one step down first: when the floor is what blocks the fill, annealing cannot fix it.
  if (floors.length > 1) {
    const hit = settle(floors[1], 3);
    if (hit) return hit;
  }

  // C. Anneal the most promising skeletons toward the target floor.
  const polish = candidates.slice(0, 3);
  for (const [i, c] of polish.entries()) {
    const now = Date.now();
    const stop = started + budget * 0.85;
    if (now > stop) break;
    const res = searchSkeleton(c.grid, {
      symmetry,
      random,
      minScore: target,
      heat,
      probe: (g) => probe(g, target),
      maxRunLength: maxRun,
      steps: 3000,
      deadline: Math.min(stop, now + (stop - now) / (polish.length - i)),
    });
    if (res.grid) return finish(res.grid, target);
    if (res.best) {
      const r = rank(res.best);
      if (r) candidates.push(r);
    }
  }

  for (const floor of floors.slice(1)) {
    const hit = settle(floor, 8);
    if (hit) return hit;
  }
  return { grid: null, attempts, minScore: target };
}
