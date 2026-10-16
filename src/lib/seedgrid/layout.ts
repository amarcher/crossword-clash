/**
 * Skeletons: place the theme ("seed") entries, lock them, then add black
 * squares around them until the grid has legal, fillable proportions.
 */
import type { WordIndex } from "./dictionary";
import {
  cloneGrid,
  emptyGrid,
  fixShortRuns,
  gridStats,
  isConnected,
  isThemeSlot,
  meetsGridStandards,
  MIN_RUN,
  partners,
  runsOf,
  setBlack,
  slotsOf,
  type Grid,
  type Symmetry,
} from "./grid";
import { enumerateSkeletons } from "./skeletonSearch";
import { FillEngine } from "./solver";

export { blackBlocks, blackCorners, cornersMustBeWhite, fixShortRuns, isThemeSlot, meetsGridStandards } from "./grid";

export interface SeedPlacement {
  word: string;
  dir: "across" | "down";
  row: number;
  col: number;
}

export interface SkeletonOptions {
  size: number;
  symmetry: Symmetry;
  seeds: string[];
  random?: () => number;
  /** Highest share of black squares (default 0.22). */
  maxBlockPct?: number;
  /** Add blacks until the average entry is at most this long (default 4.8 at 5×5, else 5). */
  maxAvgLength?: number;
  /** Break up open runs longer than this, seeds excepted (default: the grid size up to 7×7, else 6, so long slots belong to the theme). */
  maxRunLength?: number;
  /** When the random walk gets stuck, build the blacks column by column instead (slower per failed draw; default off). */
  construct?: boolean;
}

export interface Skeleton {
  grid: Grid;
  placements: SeedPlacement[];
}


function pick<T>(list: T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Writes a seed into the grid (letters locked, blacks at both ends) and
 * mirrors the blacks under the symmetry. Returns false and leaves the grid
 * unchanged if it does not fit.
 */
export function placeSeed(grid: Grid, p: SeedPlacement, symmetry: Symmetry): boolean {
  const { width: w, height: h } = grid;
  const dr = p.dir === "down" ? 1 : 0;
  const dc = p.dir === "across" ? 1 : 0;
  const endR = p.row + dr * (p.word.length - 1);
  const endC = p.col + dc * (p.word.length - 1);
  if (p.row < 0 || p.col < 0 || endR >= h || endC >= w) return false;
  const cells = grid.cells.slice();
  const locked = grid.locked.slice();
  for (let k = 0; k < p.word.length; k++) {
    const i = (p.row + dr * k) * w + p.col + dc * k;
    if (cells[i] === "#" || (cells[i] && cells[i] !== p.word[k])) return false;
    cells[i] = p.word[k];
    locked[i] = true;
  }
  const ends = [
    [p.row - dr, p.col - dc],
    [endR + dr, endC + dc],
  ].filter(([r, c]) => r >= 0 && c >= 0 && r < h && c < w);
  for (const [r, c] of ends) {
    for (const j of partners(grid, r * w + c, symmetry)) {
      if (cells[j] && cells[j] !== "#") return false;
      if (locked[j] && cells[j] !== "#") return false;
      cells[j] = "#";
    }
  }
  // A seed square's partner must stay white.
  for (let i = 0; i < cells.length; i++) {
    if (!locked[i] || cells[i] === "#") continue;
    for (const j of partners(grid, i, symmetry)) if (cells[j] === "#") return false;
  }
  grid.cells = cells;
  grid.locked = locked;
  return true;
}

/** After new blacks: clear short runs, then require a connected grid that meets the standards. */
function settle(grid: Grid, symmetry: Symmetry): boolean {
  return fixShortRuns(grid, symmetry) && isConnected(grid) && meetsGridStandards(grid);
}

/**
 * Adds a black square (and its symmetric partners) at `cell`, cleaning up any
 * runs that become too short. Returns the new grid, or null if that breaks a
 * seed, disconnects the grid, breaks the grid standards, or exceeds the block limit.
 */
export function tryBlock(grid: Grid, cell: number, symmetry: Symmetry, maxBlockPct = 0.22): Grid | null {
  const trial = cloneGrid(grid);
  if (!setBlack(trial, cell, symmetry) || !settle(trial, symmetry)) return null;
  return gridStats(trial).blockPct > maxBlockPct ? null : trial;
}

function candidatePlacements(word: string, size: number, existing: SeedPlacement[]): SeedPlacement[] {
  const out: SeedPlacement[] = [];
  for (const dir of ["across", "down"] as const) {
    for (let a = 0; a < size; a++) {
      for (let b = 0; b + word.length <= size; b++) {
        out.push(dir === "across" ? { word, dir, row: a, col: b } : { word, dir, row: b, col: a });
      }
    }
  }
  if (!existing.length) return out.filter((p) => p.dir === "across");
  return out;
}

/** Where a placement lands under the symmetry (null for none, or if it maps onto itself). */
export function mirrorPlacement(p: SeedPlacement, size: number, symmetry: Symmetry): Omit<SeedPlacement, "word"> | null {
  const L = p.word.length;
  const across = p.dir === "across";
  let m: Omit<SeedPlacement, "word">;
  switch (symmetry) {
    case "rotational":
      m = across
        ? { dir: "across", row: size - 1 - p.row, col: size - p.col - L }
        : { dir: "down", row: size - p.row - L, col: size - 1 - p.col };
      break;
    case "mirror":
      m = across ? { dir: "across", row: p.row, col: size - p.col - L } : { dir: "down", row: p.row, col: size - 1 - p.col };
      break;
    case "diagonal":
      m = { dir: across ? "down" : "across", row: p.col, col: p.row };
      break;
    default:
      return null;
  }
  return m.dir === p.dir && m.row === p.row && m.col === p.col ? null : m;
}

/** Placements that cross an existing seed at a shared letter. */
function crossingPlacements(word: string, size: number, existing: SeedPlacement[]): SeedPlacement[] {
  const out: SeedPlacement[] = [];
  for (const e of existing) {
    const dir = e.dir === "across" ? "down" : "across";
    for (let k = 0; k < e.word.length; k++) {
      for (let j = 0; j < word.length; j++) {
        if (word[j] !== e.word[k]) continue;
        const r = e.dir === "across" ? e.row - j : e.row + k;
        const c = e.dir === "across" ? e.col + k : e.col - j;
        if (r >= 0 && c >= 0 && (dir === "down" ? r + word.length <= size : c + word.length <= size)) {
          out.push({ word, dir, row: r, col: c });
        }
      }
    }
  }
  return out;
}

/** Rows (across) or columns (down) between two parallel placements; Infinity when they are not parallel. */
function lineGap(p: SeedPlacement, q: Omit<SeedPlacement, "word">): number {
  if (p.dir !== q.dir) return Infinity;
  return Math.abs(p.dir === "across" ? p.row - q.row : p.col - q.col);
}

/**
 * Parallel seeds want rows between them: one is the minimum (a down crossing
 * both has fixed letters two apart), three or more leaves the crossings free.
 */
const MIN_GAP = 2;
const EASY_GAP = 3;

function commitSeeds(grid: Grid, seeds: SeedPlacement[], symmetry: Symmetry): Grid | null {
  const trial = cloneGrid(grid);
  for (const p of seeds) if (!placeSeed(trial, p, symmetry)) return null;
  return settle(trial, symmetry) ? trial : null;
}

/** The pair plan with the centered seed (if any) already placed: where placePaired and pairedPlacements both begin. */
function pairedStart(
  opts: Pick<SkeletonOptions, "size" | "symmetry" | "seeds">,
  random: () => number,
): { grid: Grid; placements: SeedPlacement[]; pairs: [string, string][] } | null {
  const { size, symmetry } = opts;
  const plan = pairPlan(opts.seeds, size, random);
  if (!plan) return null;
  if (!plan.center) return { grid: emptyGrid(size), placements: [], pairs: plan.pairs };
  const placed = placeCenter(emptyGrid(size), plan.center, size, symmetry);
  return placed ? { grid: placed.grid, placements: [placed.p], pairs: plan.pairs } : null;
}

/** How the seeds pair up under a symmetry: mirrored pairs plus at most one centered seed. */
function pairPlan(seeds: string[], size: number, random: () => number): { pairs: [string, string][]; center: string | null } | null {
  const byLength = new Map<number, string[]>();
  for (const w of seeds) byLength.set(w.length, [...(byLength.get(w.length) ?? []), w]);
  const pairs: [string, string][] = [];
  let center: string | null = null;
  for (const len of [...byLength.keys()].sort((a, b) => b - a)) {
    const words = shuffle(byLength.get(len)!, random);
    if (words.length % 2) {
      if (center !== null || size % 2 === 0 || (size - len) % 2) return null;
      center = words.pop()!;
    }
    for (let i = 0; i < words.length; i += 2) pairs.push([words[i], words[i + 1]]);
  }
  return { pairs, center };
}

interface PairCandidate {
  grid: Grid;
  p: SeedPlacement;
  q: SeedPlacement;
  gap: number;
  blocks: number;
}

/** Every legal way to add the mirrored pair (a, b) to the grid, best-spaced and cheapest first. */
function pairCandidates(grid: Grid, placements: SeedPlacement[], a: string, b: string, size: number, symmetry: Symmetry, random: () => number): PairCandidate[] {
  const dir = symmetry === "mirror" ? "down" : "across";
  const out: (PairCandidate & { tie: number })[] = [];
  for (let line = 0; line < size; line++) {
    for (let off = 0; off + a.length <= size; off++) {
      const p: SeedPlacement = dir === "across" ? { word: a, dir, row: line, col: off } : { word: a, dir, row: off, col: line };
      const m = mirrorPlacement(p, size, symmetry);
      if (!m) continue;
      const q: SeedPlacement = { ...m, word: b };
      const gap = Math.min(lineGap(p, q), ...placements.map((e) => Math.min(lineGap(e, p), lineGap(e, q))));
      if (gap < MIN_GAP) continue;
      const next = commitSeeds(grid, [p, q], symmetry);
      if (!next) continue;
      out.push({ grid: next, p, q, gap: Math.min(gap, EASY_GAP), blocks: gridStats(next).blocks, tie: random() });
    }
  }
  return out.sort((x, y) => y.gap - x.gap || x.blocks - y.blocks || x.tie - y.tie);
}

function placeCenter(grid: Grid, center: string, size: number, symmetry: Symmetry): { grid: Grid; p: SeedPlacement } | null {
  const dir = symmetry === "mirror" ? "down" : "across";
  const mid = (size - 1) / 2;
  const off = (size - center.length) / 2;
  const p: SeedPlacement = dir === "across" ? { word: center, dir, row: mid, col: off } : { word: center, dir, row: off, col: mid };
  const next = commitSeeds(grid, [p], symmetry);
  return next ? { grid: next, p } : null;
}

/**
 * Constructors pair same-length theme entries in mirrored slots and center a
 * lone one, so the symmetry never forces a long unthemed slot opposite a seed.
 * Groups the seeds by length, places the centered one, then each pair (longest
 * first) wherever it keeps the grid legal: usually one of the best-spaced,
 * cheapest spots, sometimes any legal one, so retries explore. Null when the
 * seeds cannot be paired that way (two lengths with an odd count, or a lone
 * seed the grid cannot center).
 */
function placePaired(opts: Pick<SkeletonOptions, "size" | "symmetry" | "seeds">, random: () => number): Skeleton | null {
  const { size, symmetry } = opts;
  const start = pairedStart(opts, random);
  if (!start) return null;
  let { grid } = start;
  const { placements, pairs } = start;
  for (const [a, b] of pairs) {
    const candidates = pairCandidates(grid, placements, a, b, size, symmetry, random);
    if (!candidates.length) return null;
    const pool = random() < 0.75 ? Math.min(4, candidates.length) : candidates.length;
    const best = candidates[Math.floor(random() * pool)];
    grid = best.grid;
    placements.push(best.p, best.q);
  }
  return { grid, placements };
}

/**
 * Many distinct paired placements of the seeds (see placePaired), in a random
 * order, for a caller that can tell good layouts from bad ones with the fill
 * engine: which pair goes where decides what the crossings look like, and the
 * best-spaced choice is not always the fillable one.
 */
export function pairedPlacements(opts: Pick<SkeletonOptions, "size" | "symmetry" | "seeds" | "random">, limit = 60): Skeleton[] {
  const random = opts.random ?? Math.random;
  const { size, symmetry } = opts;
  if (symmetry === "none" || opts.seeds.some((w) => w.length > size)) return [];
  const start = pairedStart(opts, random);
  if (!start) return [];
  const out: Skeleton[] = [];
  const walk = (g: Grid, done: SeedPlacement[], pairIndex: number) => {
    if (out.length >= limit) return;
    if (pairIndex === start.pairs.length) {
      out.push({ grid: g, placements: done });
      return;
    }
    const [a, b] = start.pairs[pairIndex];
    for (const c of shuffle(pairCandidates(g, done, a, b, size, symmetry, random), random)) {
      walk(c.grid, [...done, c.p, c.q], pairIndex + 1);
      if (out.length >= limit) return;
    }
  };
  walk(start.grid, start.placements, 0);
  return out;
}

/** The old random draw: seeds longest first, each in a random legal spot (crossings allowed). */
function placeFree(opts: Pick<SkeletonOptions, "size" | "symmetry" | "seeds">, random: () => number): Skeleton | null {
  const { size, symmetry } = opts;
  const grid = emptyGrid(size);
  const placements: SeedPlacement[] = [];
  const seeds = opts.seeds.slice().sort((a, b) => b.length - a.length);
  for (const word of seeds) {
    const apart = (p: SeedPlacement) => placements.every((q) => lineGap(q, p) >= EASY_GAP);
    const parallel = candidatePlacements(word, size, placements).filter(apart);
    const crossing = crossingPlacements(word, size, placements).filter(apart);
    const mirrored = placements
      .filter((q) => q.word.length === word.length)
      .map((q) => mirrorPlacement(q, size, symmetry))
      .filter((m): m is Omit<SeedPlacement, "word"> => m !== null)
      .map((m) => ({ ...m, word }));
    const unpaired = placements.filter((q) => !placements.some((o) => o !== q && o.word.length === q.word.length)).length;
    const centered: SeedPlacement[] =
      size % 2 && (word.length - size) % 2 === 0 && seeds.filter((w) => w.length === word.length).length % 2 === 1 && !unpaired
        ? shuffle(
            [
              { word, dir: "across", row: (size - 1) / 2, col: (size - word.length) / 2 },
              { word, dir: "down", row: (size - word.length) / 2, col: (size - 1) / 2 },
            ],
            random,
          )
        : [];
    // Pairing is placePaired's job; here crossings lead half the time so stacked
    // seeds that no symmetric layout can hold (two 8s in a 9×9) still find a spot.
    const options =
      crossing.length && random() < 0.5
        ? [...shuffle(crossing, random), ...centered.filter(apart), ...mirrored.filter(apart), ...shuffle(parallel, random)]
        : [...mirrored.filter(apart), ...centered.filter(apart), ...shuffle(parallel, random), ...shuffle(crossing, random)];
    let placed = false;
    for (const p of options.slice(0, 40)) {
      const next = commitSeeds(grid, [p], symmetry);
      if (!next) continue;
      grid.cells = next.cells;
      grid.locked = next.locked;
      placements.push(p);
      placed = true;
      break;
    }
    if (!placed) return null;
  }
  return { grid, placements };
}

/**
 * Many distinct free placements of the seeds (crossings first, then parallel
 * spots), in a random order, for the same screening as pairedPlacements. Two
 * 8s in a 9×9 only work crossing each other, and only at some of the letters
 * they share, so the engine needs to see each way.
 */
export function freePlacements(opts: Pick<SkeletonOptions, "size" | "symmetry" | "seeds" | "random">, limit = 48): Skeleton[] {
  const random = opts.random ?? Math.random;
  const { size, symmetry } = opts;
  if (opts.seeds.some((w) => w.length > size)) return [];
  const seeds = opts.seeds.slice().sort((a, b) => b.length - a.length);
  const out: Skeleton[] = [];
  const seen = new Set<string>();
  const key = (p: SeedPlacement) => `${p.word}${p.dir[0]}${p.row},${p.col}`;
  // crossingOnly: every seed after the first crosses an earlier one. The budget is shared across
  // the options at each level so the first seed's position varies too.
  const walk = (grid: Grid, placements: SeedPlacement[], k: number, crossingOnly: boolean, budget: number): number => {
    if (k === seeds.length) {
      const id = placements.map(key).sort().join("|");
      if (seen.has(id)) return 0;
      seen.add(id);
      out.push({ grid, placements });
      return 1;
    }
    const word = seeds[k];
    const apart = (p: SeedPlacement) => placements.every((q) => lineGap(q, p) >= MIN_GAP);
    const crossing = shuffle(crossingPlacements(word, size, placements).filter(apart), random);
    const taken = new Set(crossing.map(key));
    const parallel = crossingOnly && k > 0 ? [] : shuffle(candidatePlacements(word, size, placements).filter((p) => apart(p) && !taken.has(key(p))), random);
    const options = [...crossing, ...parallel];
    let made = 0;
    for (const [i, p] of options.entries()) {
      if (made >= budget) break;
      const next = commitSeeds(grid, [p], symmetry);
      if (!next) continue;
      made += walk(next, [...placements, p], k + 1, crossingOnly, Math.max(1, Math.ceil((budget - made) / (options.length - i))));
    }
    return made;
  };
  walk(emptyGrid(size), [], 0, true, limit);
  if (out.length < limit) walk(emptyGrid(size), [], 0, false, limit - out.length);
  return out;
}

/**
 * Places and locks the seeds in a fresh grid, meeting the grid standards.
 * Under a symmetry, same-length seeds are usually paired in mirrored slots (see
 * placePaired); otherwise each seed takes a random legal spot, crossings
 * included. Null if this random draw does not fit.
 */
export function placeSeeds(opts: Pick<SkeletonOptions, "size" | "symmetry" | "seeds" | "random">): Skeleton | null {
  const random = opts.random ?? Math.random;
  if (opts.seeds.some((w) => w.length > opts.size)) return null;
  if (opts.symmetry === "none") return placeFree(opts, random);
  // Mostly paired, sometimes the free draw: two 8s in a 9×9 only work crossing each other.
  if (random() < 0.6) return placePaired(opts, random) ?? placeFree(opts, random);
  return placeFree(opts, random) ?? placePaired(opts, random);
}

/**
 * One randomized skeleton attempt. Returns null when this draw of seed
 * positions or blacks does not yield a legal grid; call again to retry.
 */
export function buildSkeleton(opts: SkeletonOptions): Skeleton | null {
  const random = opts.random ?? Math.random;
  const { size, symmetry } = opts;
  const maxBlockPct = opts.maxBlockPct ?? 0.22;
  const maxAvg = opts.maxAvgLength ?? (size <= 5 ? 4.8 : 5);
  const maxRun = opts.maxRunLength ?? (size <= 7 ? size : 6);
  const placed = placeSeeds(opts);
  if (!placed) return null;
  const { placements } = placed;
  const seedGrid = cloneGrid(placed.grid);
  const grid = placed.grid;

  const seedRun = (cells: number[]) => isThemeSlot(grid, cells, symmetry);
  for (let tries = 0; tries < size * size * 4; tries++) {
    const stats = gridStats(grid);
    const runs = runsOf(grid)
      .filter((s) => s.cells.length > MIN_RUN && !seedRun(s.cells))
      .sort((a, b) => b.cells.length - a.cells.length);
    const tooLong = runs.filter((s) => s.cells.length > maxRun);
    if (stats.avgLength <= maxAvg && !tooLong.length) break;
    const target = tooLong.length ? pick(tooLong, random) : pick(runs.slice(0, 3), random);
    if (!target) break;
    // A black may go at either end (a corner) or where it leaves 3+ on each side.
    const n = target.cells.length;
    const spots = target.cells.filter(
      (i, k) => (k === 0 || k >= MIN_RUN) && (k === n - 1 || n - 1 - k >= MIN_RUN) && !grid.locked[i] && !grid.cells[i],
    );
    if (!spots.length) continue;
    const trial = cloneGrid(grid);
    if (!setBlack(trial, pick(spots, random), symmetry) || !settle(trial, symmetry)) continue;
    if (gridStats(trial).blockPct > maxBlockPct) continue;
    grid.cells = trial.cells;
  }

  const stats = gridStats(grid);
  const legal = !stats.shortRuns && stats.connected && stats.blockPct <= maxBlockPct && meetsGridStandards(grid) && !runsOf(grid).some((s) => s.cells.length > maxRun && !seedRun(s.cells));
  if (legal) return { grid, placements };
  if (!opts.construct) return null;
  // The walk can paint itself into a corner (a column it can no longer break without a 2×2 or an
  // island); build the blacks column by column instead, taking the tightest grid that is in proportion.
  const built = enumerateSkeletons(seedGrid, { symmetry, random, limit: 6, maxRunLength: maxRun, maxBlockPct })
    .map((g) => ({ g, avg: gridStats(g).avgLength }))
    .sort((a, b) => a.avg - b.avg)[0];
  return built && built.avg <= maxAvg + 1 ? { grid: built.g, placements } : null;
}

export interface ShapeOptions {
  symmetry: Symmetry;
  maxBlockPct?: number;
  maxAvgLength?: number;
  maxRunLength?: number;
  maxShared?: number;
  random?: () => number;
}

/**
 * Adds black squares the way a constructor reads Ingrid's heatmap: find the
 * worst slot (too long, or with the fewest options), try a black in each of
 * its squares, keep the one that leaves the most room, repeat until the grid
 * is consistent and in proportion. Null if it gets stuck.
 */
export function shapeSkeleton(start: Grid, index: WordIndex, opts: ShapeOptions): Grid | null {
  const random = opts.random ?? Math.random;
  const size = Math.max(start.width, start.height);
  const maxBlockPct = opts.maxBlockPct ?? 0.22;
  const maxAvg = opts.maxAvgLength ?? (size <= 5 ? 4.8 : 5);
  const maxRun = opts.maxRunLength ?? (size <= 7 ? size : 6);
  const { symmetry } = opts;
  const blocks = (g: Grid) => g.cells.filter((c) => c === "#").length;
  const longCount = (g: Grid) => slotsOf(g).filter((s) => s.cells.length > maxRun && !isThemeSlot(g, s.cells, symmetry)).length;
  // Fill room gained, minus the black squares spent and the over-long slots left.
  const rate = (g: Grid, from: Grid): number => {
    const engine = new FillEngine(g, index, { maxShared: opts.maxShared });
    const options = engine.slotOptions().filter((_, si) => engine.fixed[si] === null);
    const tightest = Math.min(1000, ...options);
    return (
      (engine.consistentDomains() ? 2_000 : 0) +
      100 * Math.log2(1 + tightest) -
      120 * (blocks(g) - blocks(from)) -
      80 * longCount(g)
    );
  };

  let grid = start;
  for (let step = 0; step < size * 4; step++) {
    const engine = new FillEngine(grid, index, { maxShared: opts.maxShared });
    const stats = gridStats(grid);
    const runs = slotsOf(grid).filter((s) => !isThemeSlot(grid, s.cells, symmetry));
    const tooLong = runs.filter((s) => s.cells.length > maxRun);
    const consistent = engine.consistentDomains() !== null;
    if (consistent && !tooLong.length && stats.avgLength <= maxAvg) return grid;

    let targets = tooLong;
    if (!targets.length && !consistent) {
      const options = engine.slotOptions();
      targets = engine.slots
        .map((s, si) => ({ s, n: engine.fixed[si] === null ? options[si] : Infinity }))
        .filter((o) => o.n !== Infinity)
        .sort((a, b) => a.n - b.n)
        .slice(0, 3)
        .map((o) => o.s);
    }
    if (!targets.length) targets = runs.sort((a, b) => b.cells.length - a.cells.length).slice(0, 3);

    const spots = [...new Set(targets.flatMap((s) => s.cells))].filter((i) => !grid.locked[i] && !grid.cells[i]);
    let best: Grid | null = null;
    let bestScore = -Infinity;
    let tried = 0;
    for (const i of shuffle(spots, random)) {
      if (tried >= 14) break;
      const next = tryBlock(grid, i, symmetry, maxBlockPct);
      if (!next) continue;
      tried++;
      const score = rate(next, grid) + random();
      if (score > bestScore) {
        bestScore = score;
        best = next;
      }
    }
    if (!best) return null;
    grid = best;
  }
  return null;
}
