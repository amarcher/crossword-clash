/**
 * Local search over black squares for skeletons the random draws cannot
 * reach: four stacked themers in a 15×15 leave full-height columns that only a
 * coordinated set of blacks can break. Simulated annealing over symmetric
 * toggles, scored first by the grid rules (cheap, no engine call) and then by
 * the engine's heatmap (arc-consistent option counts per slot), with a real
 * fill probe whenever a grid looks promising. Engine-agnostic so tests can
 * drive it with the JS solver or a stub.
 */
import { blackBlocks, blackCorners, cloneGrid, cornersMustBeWhite, fixShortRuns, gridStats, isThemeSlot, partners, runsOf, slotsOf, type Grid, type Symmetry } from "./grid";

export interface Heat {
  /** False when the grid is provably unfillable. */
  ok: boolean;
  /** Slot id → number of words still possible there. */
  counts: Record<string, number>;
}

export interface SearchOptions {
  symmetry: Symmetry;
  random: () => number;
  /** The score floor the skeleton must fill at. */
  minScore: number;
  /** The heatmap for a legal grid at a score floor. */
  heat: (grid: Grid, minScore: number) => Heat;
  /** A real fill attempt; only called on legal grids whose heatmap looks healthy. */
  probe: (grid: Grid) => boolean;
  /** Stop after this many steps (default 3000) ... */
  steps?: number;
  /** ... or once Date.now() passes this. */
  deadline?: number;
  /** At most this many probes (default 20). */
  maxProbes?: number;
  /** Highest share of black squares (default 0.26). */
  maxBlockPct?: number;
  /** Unthemed runs longer than this count against the grid (default 7). */
  maxRunLength?: number;
  /** Straight runs of black squares longer than this count against the grid (default 4). */
  maxBlackRun?: number;
  /** Probe only when the tightest free slot still has at least this many options (default 2). */
  minOptions?: number;
  /** Share of moves that re-roll a whole line instead of toggling cells (default 0.5). */
  lineMoveRate?: number;
  /** Diagnostics: called after every evaluated move. */
  onStep?: (info: { step: number; score: number; legal: boolean; accepted: boolean; grid: Grid }) => void;
}

export interface SearchResult {
  /** A skeleton the probe filled, or null. */
  grid: Grid | null;
  steps: number;
  probes: number;
  /** The best legal grid seen (filled or not), for diagnostics. */
  best: Grid | null;
}

/** Seed squares and their symmetric partners: never black, and allowed in a run longer than maxRun. */
function themeCells(grid: Grid, symmetry: Symmetry): boolean[] {
  return grid.cells.map((_, i) => grid.locked[i] || partners(grid, i, symmetry).some((j) => grid.locked[j]));
}

/** Black squares at the ends of a theme entry; moving one would change the entry. */
function frozenCells(grid: Grid): Set<number> {
  const { width: w, height: h } = grid;
  const frozen = new Set<number>();
  const lockedRun = (i: number, step: number, inBounds: (j: number) => boolean) => {
    let n = 0;
    for (let j = i; inBounds(j) && grid.locked[j]; j += step) n++;
    return n;
  };
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] !== "#") continue;
    const r = Math.floor(i / w);
    const c = i % w;
    if (c + 1 < w && lockedRun(i + 1, 1, (j) => Math.floor(j / w) === r) >= 3) frozen.add(i);
    if (c > 0 && lockedRun(i - 1, -1, (j) => j >= 0 && Math.floor(j / w) === r) >= 3) frozen.add(i);
    if (r + 1 < h && lockedRun(i + w, w, (j) => j < w * h) >= 3) frozen.add(i);
    if (r > 0 && lockedRun(i - w, -w, (j) => j >= 0) >= 3) frozen.add(i);
  }
  return frozen;
}


/**
 * Every way to black out a line (row or column) so each white run is 3..maxRun
 * long (longer only when every cell is locked: a theme entry or its mirror),
 * black runs at most maxBlackRun, locked cells stay white and frozen cells stay
 * black. The search re-rolls
 * whole lines with these, because a column crossing several themers has only a
 * few legal shapes and single toggles rarely move between them.
 */
export function linePatterns(locked: boolean[], frozen: boolean[], maxRun: number, maxBlackRun = Infinity, limit = 4000): boolean[][] {
  const n = locked.length;
  const out: boolean[][] = [];
  const cur: boolean[] = Array(n).fill(false);
  const canWhite = (i: number) => !frozen[i];
  const canBlack = (i: number) => !locked[i];
  const go = (i: number, afterWhite: boolean) => {
    if (out.length >= limit) return;
    if (i === n) {
      out.push(cur.slice());
      return;
    }
    // A black run (at least one when following a white run, at most maxBlackRun).
    for (let b = afterWhite ? 1 : 0; i + b <= n && b <= maxBlackRun; b++) {
      if (b > 0 && !canBlack(i + b - 1)) break;
      for (let k = 0; k < b; k++) cur[i + k] = true;
      const j = i + b;
      if (j === n) {
        out.push(cur.slice());
        if (out.length >= limit) return;
        continue;
      }
      if (j + 3 > n || !canWhite(j) || !canWhite(j + 1)) continue;
      let allLocked = locked[j] && locked[j + 1];
      for (let len = 3; j + len <= n; len++) {
        const last = j + len - 1;
        if (!canWhite(last)) break;
        allLocked &&= locked[last];
        // Only a theme entry (every cell locked) may run longer than maxRun.
        if (len > maxRun && !allLocked) break;
        cur[last] = false;
        go(j + len, true);
      }
    }
    for (let k = i; k < n; k++) cur[k] = false;
  };
  go(0, false);
  return out;
}


export interface EnumerateOptions {
  symmetry: Symmetry;
  random: () => number;
  /** Unthemed runs longer than this are illegal (default 7). */
  maxRunLength?: number;
  /** Straight runs of black squares longer than this are illegal (default 4). */
  maxBlackRun?: number;
  /** Highest share of black squares (default 0.26). */
  maxBlockPct?: number;
  /** How many distinct skeletons to return (default 40). */
  limit?: number;
  /** Pattern applications allowed per skeleton (default 20000). */
  nodeBudget?: number;
  /** Consistent patterns descended into per column before backtracking (default 24). */
  branch?: number;
  /** Stop once Date.now() passes this. */
  deadline?: number;
}

/**
 * Legal skeletons around the seeds, built column by column: each column takes
 * one of its legal patterns (see linePatterns), its symmetric partner follows,
 * and every row run that is already closed on both sides is checked at once,
 * along with corners, 2×2 blocks and black bars. Depth-first with a random
 * pattern order, restarted per skeleton, so repeated calls give different grids.
 * Engine-free: callers rank the results by heatmap and probe the best.
 */
export function enumerateSkeletons(start: Grid, opts: EnumerateOptions): Grid[] {
  const { symmetry, random } = opts;
  const maxRun = opts.maxRunLength ?? 7;
  const maxBlackRun = opts.maxBlackRun ?? 4;
  const maxBlocks = Math.floor((opts.maxBlockPct ?? 0.26) * start.cells.length);
  const limit = opts.limit ?? 40;
  const nodeBudget = opts.nodeBudget ?? 20000;
  const branch = opts.branch ?? 24;
  const deadline = opts.deadline ?? Infinity;
  const { width: w, height: h } = start;
  const n = w * h;
  const out: Grid[] = [];
  const seen = new Set<string>();
  const corners = cornersMustBeWhite(start) ? [0, w - 1, (h - 1) * w, n - 1] : [];
  const theme = themeCells(start, symmetry);

  for (let attempt = 0; attempt < limit * 3 && out.length < limit && Date.now() < deadline; attempt++) {
    const cells = start.cells.slice();
    const known = cells.map((c, i) => c !== "" || start.locked[i]);
    let blocks = cells.filter((c) => c === "#").length;
    let nodes = 0;
    const black = (i: number) => known[i] && cells[i] === "#";
    const white = (i: number) => known[i] && cells[i] !== "#";

    /** False when something already determined breaks a rule. */
    const consistent = (): boolean => {
      if (blocks > maxBlocks) return false;
      if (corners.some(black)) return false;
      for (let r = 0; r + 1 < h; r++) {
        for (let c = 0; c + 1 < w; c++) {
          const i = r * w + c;
          if (black(i) && black(i + 1) && black(i + w) && black(i + w + 1)) return false;
        }
      }
      const line = (first: number, step: number, len: number): boolean => {
        let whites = 0;
        let blacks = 0;
        let allTheme = true;
        let open = false; // the current white run touches an unknown cell
        for (let k = 0; k <= len; k++) {
          const i = first + k * step;
          const atEnd = k === len;
          if (!atEnd && !known[i]) {
            open = true;
            whites = 0;
            blacks = 0;
            continue;
          }
          if (atEnd || cells[i] === "#") {
            if (!open && whites > 0 && (whites < 3 || (whites > maxRun && !allTheme))) return false;
            whites = 0;
            allTheme = true;
            open = false;
            if (!atEnd && ++blacks > maxBlackRun) return false;
          } else {
            whites++;
            blacks = 0;
            if (!theme[i]) allTheme = false;
          }
        }
        return true;
      };
      for (let r = 0; r < h; r++) if (!line(r * w, 1, w)) return false;
      for (let c = 0; c < w; c++) if (!line(c, w, h)) return false;
      return true;
    };

    const dfs = (c: number): boolean => {
      if (nodes > nodeBudget || Date.now() > deadline) return false;
      if (c === w) {
        const grid: Grid = { ...start, cells: cells.slice(), locked: start.locked.slice() };
        if (rulePenalty(grid, symmetry, (opts.maxBlockPct ?? 0.26) + 1e-9, maxRun, maxBlackRun) > 0) return false;
        const key = cells.map((x) => (x === "#" ? "#" : ".")).join("");
        if (seen.has(key)) return false;
        seen.add(key);
        out.push(grid);
        return true;
      }
      const col = Array.from({ length: h }, (_, r) => r * w + c);
      const patterns = linePatterns(col.map((i) => white(i) || theme[i] || corners.includes(i)), col.map(black), maxRun, maxBlackRun);
      const order = patterns.map((p) => ({ p, k: random() })).sort((a, b) => a.k - b.k);
      let descents = 0;
      for (const { p } of order) {
        if (descents >= branch) break;
        nodes++;
        const undo: number[] = [];
        let ok = true;
        for (let k = 0; k < h && ok; k++) {
          const v = p[k] ? "#" : "";
          for (const j of partners(start, col[k], symmetry)) {
            if (known[j]) {
              if ((cells[j] === "#") !== p[k]) ok = false;
              continue;
            }
            known[j] = true;
            cells[j] = v;
            if (v === "#") blocks++;
            undo.push(j);
          }
        }
        if (ok && consistent()) {
          descents++;
          if (dfs(c + 1)) return true;
        }
        for (const j of undo) {
          if (cells[j] === "#") blocks--;
          known[j] = false;
          cells[j] = "";
        }
      }
      return false;
    };
    dfs(0);
  }
  return out;
}

/**
 * Zero when the grid is legal; otherwise how far from legal it is. Structure
 * (short runs, islands, corners, 2×2 blocks) weighs far more than
 * an over-long run, or the walk would black out a whole row between two
 * themers to break every column at once.
 */
export function rulePenalty(grid: Grid, symmetry: Symmetry, maxBlockPct: number, maxRun: number, maxBlackRun = 4): number {
  const stats = gridStats(grid);
  let pen = 1000 * stats.shortRuns + (stats.connected ? 0 : 5000);
  pen += 1000 * ((cornersMustBeWhite(grid) ? blackCorners(grid).length : 0) + blackBlocks(grid).length);
  pen += 50 * Math.max(0, stats.blocks - Math.floor(maxBlockPct * grid.cells.length));
  for (const s of runsOf(grid)) {
    if (s.cells.length > maxRun && !isThemeSlot(grid, s.cells, symmetry)) pen += 100 + 20 * (s.cells.length - maxRun);
  }
  // Long bars of black read as walls (and a row-long one cuts the grid in two).
  const { width: w, height: h } = grid;
  const bar = (start: number, step: number, n: number) => {
    let run = 0;
    for (let k = 0; k < n; k++) {
      run = grid.cells[start + k * step] === "#" ? run + 1 : 0;
      if (run > maxBlackRun) pen += 150;
    }
  };
  for (let r = 0; r < h; r++) bar(r * w, 1, w);
  for (let c = 0; c < w; c++) bar(c, w, h);
  return pen;
}

/**
 * Legal grids score by their heatmap at the highest score floor where it is
 * still consistent (the target, a step below it, then anything goes): the
 * tightest free slot matters most, then the average room. A grid that is dead
 * even with every word allowed scores by how many slots are dead. `min` is the
 * tightest count at the target floor, 0 when inconsistent there.
 */
function heatScore(grid: Grid, minScore: number, heat: SearchOptions["heat"]): { score: number; min: number } {
  const free = slotsOf(grid).filter((s) => !s.cells.every((i) => grid.locked[i]));
  if (!free.length) return { score: 0, min: 0 };
  const blocks = grid.cells.filter((c) => c === "#").length;
  const levels = [...new Set([minScore, Math.max(0, minScore - 10), 0])];
  // Slots dead at the target floor keep costing at lower tiers, so a move that reshapes one is rewarded.
  let dead = 0;
  for (const [tier, level] of levels.entries()) {
    const h = heat(grid, level);
    if (!h.ok) {
      dead += Object.values(h.counts).filter((n) => n === 0).length;
      continue;
    }
    const counts = free.map((s) => h.counts[s.id] ?? 0);
    const min = Math.min(...counts);
    const logMean = counts.reduce((a, n) => a + Math.log2(1 + n), 0) / counts.length;
    const base = [1000, 500, 200][tier] ?? 200;
    return { score: base + 10 * Math.min(min, 60) + logMean - 0.5 * blocks - 40 * dead, min: tier === 0 ? min : 0 };
  }
  return { score: 100 - 10 * dead, min: 0 };
}

export function searchSkeleton(start: Grid, opts: SearchOptions): SearchResult {
  const { symmetry, random } = opts;
  const maxSteps = opts.steps ?? 3000;
  const deadline = opts.deadline ?? Infinity;
  const maxProbes = opts.maxProbes ?? 20;
  const maxBlockPct = opts.maxBlockPct ?? 0.26;
  const maxRun = opts.maxRunLength ?? 7;
  const maxBlackRun = opts.maxBlackRun ?? 4;
  const minOptions = opts.minOptions ?? 2;
  const lineMoveRate = opts.lineMoveRate ?? 0.5;
  const frozen = frozenCells(start);
  const theme = themeCells(start, symmetry);
  const movable = start.cells.map((_, i) => i).filter((i) => !theme[i] && !frozen.has(i));
  if (!movable.length) return { grid: null, steps: 0, probes: 0, best: null };
  const { width: w, height: h } = start;
  // Rows then columns, as cell index lists; their legal patterns are computed on first use.
  const lines: number[][] = [
    ...Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => r * w + c)),
    ...Array.from({ length: w }, (_, c) => Array.from({ length: h }, (_, r) => r * w + c)),
  ];
  const patterns = new Map<number, boolean[][]>();
  const patternsFor = (li: number) => {
    let p = patterns.get(li);
    if (!p) {
      const cells = lines[li];
      p = linePatterns(cells.map((i) => theme[i]), cells.map((i) => frozen.has(i)), maxRun, maxBlackRun);
      patterns.set(li, p);
    }
    return p;
  };
  /** Rewrites one line to a random legal pattern (and its mirror). False if the symmetry contradicts it. */
  const rerollLine = (g: Grid): boolean => {
    const li = Math.floor(random() * lines.length);
    const options = patternsFor(li);
    if (!options.length) return false;
    const cells = lines[li];
    const pattern = options[Math.floor(random() * options.length)];
    for (let k = 0; k < cells.length; k++) {
      const v = pattern[k] ? "#" : "";
      for (const j of partners(g, cells[k], symmetry)) {
        if (g.locked[j]) {
          if (v === "#") return false;
          continue;
        }
        if (frozen.has(j) && v === "") return false;
        g.cells[j] = v;
      }
    }
    return cells.every((i, k) => (g.cells[i] === "#") === pattern[k]);
  };

  const evaluate = (g: Grid): { score: number; min: number; legal: boolean } => {
    const pen = rulePenalty(g, symmetry, maxBlockPct, maxRun, maxBlackRun);
    if (pen > 0) return { score: -pen, min: 0, legal: false };
    return { ...heatScore(g, opts.minScore, opts.heat), legal: true };
  };

  let grid = cloneGrid(start);
  let current = evaluate(grid);
  let best: { grid: Grid; score: number } | null = current.legal ? { grid: cloneGrid(grid), score: current.score } : null;
  let bestProbed = -Infinity;
  const probed = new Set<string>();
  let probes = 0;
  let steps = 0;

  const tryProbe = (g: Grid, e: { score: number; min: number; legal: boolean }): boolean => {
    if (!e.legal || e.min < minOptions || probes >= maxProbes || e.score <= bestProbed) return false;
    const key = g.cells.map((c) => (c === "#" ? "#" : ".")).join("");
    if (probed.has(key)) return false;
    probed.add(key);
    probes++;
    bestProbed = e.score;
    return opts.probe(g);
  };

  if (tryProbe(grid, current)) return { grid, steps, probes, best: grid };

  for (steps = 1; steps <= maxSteps && Date.now() < deadline; steps++) {
    const next = cloneGrid(grid);
    if (random() < lineMoveRate) {
      if (!rerollLine(next)) continue;
    } else {
      const toggles = random() < 0.7 ? 1 : 2;
      for (let k = 0; k < toggles; k++) {
        const i = movable[Math.floor(random() * movable.length)];
        const group = partners(next, i, symmetry);
        if (group.some((j) => next.locked[j] || frozen.has(j))) continue;
        const v = next.cells[i] === "#" ? "" : "#";
        for (const j of group) next.cells[j] = v;
      }
    }
    // Repair the 1–2 letter runs a move leaves, as the random walker does; a move that cannot be repaired is dropped.
    if (!fixShortRuns(next, symmetry)) continue;
    const e = evaluate(next);
    // Hotter early so the walk can cross illegal grids; the rule penalties dominate until legal.
    const temp = 30 * (1 - steps / maxSteps) + 1;
    const accepted = e.score >= current.score || random() < Math.exp((e.score - current.score) / temp);
    opts.onStep?.({ step: steps, score: e.score, legal: e.legal, accepted, grid: next });
    if (accepted) {
      grid = next;
      current = e;
      if (e.legal && (!best || e.score > best.score)) {
        best = { grid: cloneGrid(next), score: e.score };
        if (tryProbe(next, e)) return { grid: next, steps, probes, best: next };
      }
    }
  }
  return { grid: null, steps, probes, best: best?.grid ?? null };
}
