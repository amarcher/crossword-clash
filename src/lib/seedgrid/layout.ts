/**
 * Skeletons: place the theme ("seed") entries, lock them, then add black
 * squares around them until the grid has legal, fillable proportions.
 */
import type { WordIndex } from "./dictionary";
import { emptyGrid, gridStats, isConnected, partners, runsOf, slotsOf, type Grid, type Symmetry } from "./grid";
import { FillEngine } from "./solver";

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
}

export interface Skeleton {
  grid: Grid;
  placements: SeedPlacement[];
}

const MIN_LEN = 3;

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

function setBlack(grid: Grid, i: number, symmetry: Symmetry): boolean {
  const group = partners(grid, i, symmetry);
  if (group.some((j) => grid.locked[j] || (grid.cells[j] && grid.cells[j] !== "#"))) return false;
  for (const j of group) grid.cells[j] = "#";
  return true;
}

/** Blacks out runs of 1–2 squares. False if a short run holds a seed letter. */
function fixShortRuns(grid: Grid, symmetry: Symmetry): boolean {
  for (let guard = 0; guard < grid.cells.length; guard++) {
    const short = runsOf(grid).find((s) => s.cells.length < MIN_LEN);
    if (!short) return true;
    for (const i of short.cells) if (grid.cells[i] !== "#" && !setBlack(grid, i, symmetry)) return false;
  }
  return false;
}

/**
 * Adds a black square (and its symmetric partners) at `cell`, cleaning up any
 * runs that become too short. Returns the new grid, or null if that breaks a
 * seed, disconnects the grid, or exceeds the block limit.
 */
export function tryBlock(grid: Grid, cell: number, symmetry: Symmetry, maxBlockPct = 0.22): Grid | null {
  const trial = { ...grid, cells: grid.cells.slice(), locked: grid.locked.slice() };
  if (!setBlack(trial, cell, symmetry) || !fixShortRuns(trial, symmetry) || !isConnected(trial)) return null;
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

/** Seed slots, and the slots the symmetry mirrors them into, may stay long. */
function isThemeSlot(grid: Grid, cells: number[], symmetry: Symmetry): boolean {
  return cells.every((i) => grid.locked[i]) || cells.every((i) => partners(grid, i, symmetry).some((j) => grid.locked[j]));
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

/** Places and locks the seeds (longest first) in a fresh grid. Null if this random draw does not fit. */
export function placeSeeds(opts: Pick<SkeletonOptions, "size" | "symmetry" | "seeds" | "random">): Skeleton | null {
  const random = opts.random ?? Math.random;
  const { size, symmetry } = opts;
  const grid = emptyGrid(size);
  const placements: SeedPlacement[] = [];
  const seeds = opts.seeds.slice().sort((a, b) => b.length - a.length);
  for (const word of seeds) {
    if (word.length > size) return null;
    // Parallel seeds need 3+ rows between them: closer, every crossing entry gets a fixed
    // letter at every other square. Crossing seeds are tried half the time.
    const apart = (p: SeedPlacement) =>
      placements.every((q) => q.dir !== p.dir || Math.abs(p.dir === "across" ? p.row - q.row : p.col - q.col) >= 3);
    const parallel = candidatePlacements(word, size, placements).filter(apart);
    const crossing = crossingPlacements(word, size, placements).filter(apart);
    // Constructors pair same-length theme entries in mirrored slots, and center a lone one,
    // so the symmetry never forces a long unthemed slot opposite a seed.
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
    const options = [
      ...mirrored.filter(apart),
      ...centered.filter(apart),
      ...(crossing.length && random() < 0.5 ? shuffle(crossing, random) : []),
      ...shuffle(parallel, random),
      ...shuffle(crossing, random),
    ];
    let placed = false;
    for (const p of options.slice(0, 40)) {
      const trial = { ...grid, cells: grid.cells.slice(), locked: grid.locked.slice() };
      if (!placeSeed(trial, p, symmetry) || !fixShortRuns(trial, symmetry) || !isConnected(trial)) continue;
      grid.cells = trial.cells;
      grid.locked = trial.locked;
      placements.push(p);
      placed = true;
      break;
    }
    if (!placed) return null;
  }

  return { grid, placements };
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
  const { grid, placements } = placed;

  const seedRun = (cells: number[]) => isThemeSlot(grid, cells, symmetry);
  for (let tries = 0; tries < size * size * 4; tries++) {
    const stats = gridStats(grid);
    const runs = runsOf(grid)
      .filter((s) => s.cells.length > MIN_LEN && !seedRun(s.cells))
      .sort((a, b) => b.cells.length - a.cells.length);
    const tooLong = runs.filter((s) => s.cells.length > maxRun);
    if (stats.avgLength <= maxAvg && !tooLong.length) break;
    const target = tooLong.length ? pick(tooLong, random) : pick(runs.slice(0, 3), random);
    if (!target) break;
    // A black may go at either end (a corner) or where it leaves 3+ on each side.
    const n = target.cells.length;
    const spots = target.cells.filter(
      (i, k) => (k === 0 || k >= MIN_LEN) && (k === n - 1 || n - 1 - k >= MIN_LEN) && !grid.locked[i] && !grid.cells[i],
    );
    if (!spots.length) continue;
    const trial = { ...grid, cells: grid.cells.slice(), locked: grid.locked.slice() };
    if (!setBlack(trial, pick(spots, random), symmetry) || !fixShortRuns(trial, symmetry) || !isConnected(trial)) continue;
    if (gridStats(trial).blockPct > maxBlockPct) continue;
    grid.cells = trial.cells;
  }

  const stats = gridStats(grid);
  if (stats.shortRuns || !stats.connected || stats.blockPct > maxBlockPct) return null;
  if (runsOf(grid).some((s) => s.cells.length > maxRun && !seedRun(s.cells))) return null;
  return { grid, placements };
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
