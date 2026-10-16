/**
 * Grid geometry for construction: cells, slots (entries), symmetry, stats.
 * Cells are row-major strings: "#" black, "" open, "A".."Z" a letter.
 */

export type Symmetry = "rotational" | "mirror" | "diagonal" | "none";

export interface Grid {
  width: number;
  height: number;
  cells: string[];
  /** Locked cells (theme entries) are never cleared by fill or reset. */
  locked: boolean[];
}

export interface Slot {
  /** "5A" / "12D". */
  id: string;
  number: number;
  dir: "across" | "down";
  cells: number[];
}

export interface Crossing {
  /** Position of the shared cell in this slot. */
  pos: number;
  other: number;
  otherPos: number;
}

export function emptyGrid(width: number, height = width): Grid {
  return { width, height, cells: Array(width * height).fill(""), locked: Array(width * height).fill(false) };
}

export function gridFromRows(rows: string[]): Grid {
  const height = rows.length;
  const width = rows[0].length;
  const cells = rows.join("").split("").map((ch) => (ch === "#" ? "#" : ch === "." || ch === " " ? "" : ch.toUpperCase()));
  return { width, height, cells, locked: Array(width * height).fill(false) };
}

export function gridToRows(grid: Grid): string[] {
  const rows: string[] = [];
  for (let r = 0; r < grid.height; r++) {
    rows.push(grid.cells.slice(r * grid.width, (r + 1) * grid.width).map((c) => c || ".").join(""));
  }
  return rows;
}

export function cloneGrid(grid: Grid): Grid {
  return { ...grid, cells: grid.cells.slice(), locked: grid.locked.slice() };
}

export const isBlack = (grid: Grid, i: number) => grid.cells[i] === "#";

/** Cells that must match `i` under the symmetry (including `i`). */
export function partners(grid: Grid, i: number, symmetry: Symmetry): number[] {
  const { width: w, height: h } = grid;
  const r = Math.floor(i / w);
  const c = i % w;
  let j: number;
  switch (symmetry) {
    case "rotational":
      j = (h - 1 - r) * w + (w - 1 - c);
      break;
    case "mirror":
      j = r * w + (w - 1 - c);
      break;
    case "diagonal":
      if (w !== h) return [i];
      j = c * w + r;
      break;
    default:
      return [i];
  }
  return j === i ? [i] : [i, j];
}

/** Every maximal white run, numbered the standard way. Includes runs shorter than 3. */
export function runsOf(grid: Grid): Slot[] {
  const { width: w, height: h } = grid;
  const open = (r: number, c: number) => r >= 0 && r < h && c >= 0 && c < w && grid.cells[r * w + c] !== "#";
  const slots: Slot[] = [];
  let n = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!open(r, c)) continue;
      const startsAcross = !open(r, c - 1) && open(r, c + 1);
      const startsDown = !open(r - 1, c) && open(r + 1, c);
      const loneAcross = !open(r, c - 1) && !open(r, c + 1);
      const loneDown = !open(r - 1, c) && !open(r + 1, c);
      if (!startsAcross && !startsDown) {
        // 1-letter runs are reported unnumbered so validation can see them.
        if (loneAcross) slots.push({ id: `${r * w + c}a1`, number: 0, dir: "across", cells: [r * w + c] });
        if (loneDown) slots.push({ id: `${r * w + c}d1`, number: 0, dir: "down", cells: [r * w + c] });
        continue;
      }
      n++;
      if (startsAcross) {
        const cells: number[] = [];
        for (let cc = c; open(r, cc); cc++) cells.push(r * w + cc);
        slots.push({ id: `${n}A`, number: n, dir: "across", cells });
      } else if (loneAcross) slots.push({ id: `${r * w + c}a1`, number: 0, dir: "across", cells: [r * w + c] });
      if (startsDown) {
        const cells: number[] = [];
        for (let rr = r; open(rr, c); rr++) cells.push(rr * w + c);
        slots.push({ id: `${n}D`, number: n, dir: "down", cells });
      } else if (loneDown) slots.push({ id: `${r * w + c}d1`, number: 0, dir: "down", cells: [r * w + c] });
    }
  }
  return slots;
}

/** The entries of a valid grid (every run is at least 2 long). */
export function slotsOf(grid: Grid): Slot[] {
  return runsOf(grid).filter((s) => s.cells.length >= 2);
}

export function crossingsOf(slots: Slot[]): Crossing[][] {
  const at = new Map<number, { slot: number; pos: number }[]>();
  slots.forEach((s, si) => s.cells.forEach((cell, pos) => {
    const list = at.get(cell) ?? [];
    list.push({ slot: si, pos });
    at.set(cell, list);
  }));
  return slots.map((s, si) =>
    s.cells.flatMap((cell, pos) =>
      (at.get(cell) ?? []).filter((o) => o.slot !== si).map((o) => ({ pos, other: o.slot, otherPos: o.pos })),
    ),
  );
}

export function slotText(grid: Grid, slot: Slot): string {
  return slot.cells.map((i) => grid.cells[i] || ".").join("");
}

export function isConnected(grid: Grid): boolean {
  const start = grid.cells.findIndex((c) => c !== "#");
  if (start < 0) return false;
  const seen = new Set([start]);
  const stack = [start];
  const { width: w, height: h } = grid;
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / w);
    const c = i % w;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
      const j = rr * w + cc;
      if (grid.cells[j] !== "#" && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === grid.cells.filter((c) => c !== "#").length;
}

export interface GridStats {
  words: number;
  avgLength: number;
  blocks: number;
  blockPct: number;
  threes: number;
  /** Runs of 1–2 letters: illegal in a finished grid. */
  shortRuns: number;
  longest: number;
  connected: boolean;
}

export function gridStats(grid: Grid): GridStats {
  const runs = runsOf(grid);
  const words = runs.filter((s) => s.cells.length >= 3);
  const blocks = grid.cells.filter((c) => c === "#").length;
  return {
    words: words.length,
    avgLength: words.length ? words.reduce((n, s) => n + s.cells.length, 0) / words.length : 0,
    blocks,
    blockPct: blocks / grid.cells.length,
    threes: words.filter((s) => s.cells.length === 3).length,
    shortRuns: runs.length - words.length,
    longest: Math.max(0, ...runs.map((s) => s.cells.length)),
    connected: isConnected(grid),
  };
}

/**
 * Grid standards: the four corner squares stay white, and no 2×2 (or larger)
 * all-black block anywhere. A `####` run in a corner or a 2×2 at a themer's end
 * reads as filler, so every skeleton builder treats both as illegal.
 */

/**
 * Minis and midis need their corner blacks (a 4-letter entry in a 5×5, an
 * 8-letter themer in a 9×9 force one); from 11×11 up there is room to keep
 * them white.
 */
export function cornersMustBeWhite(grid: Grid): boolean {
  return Math.min(grid.width, grid.height) >= 11;
}

export function blackCorners(grid: Grid): number[] {
  const { width: w, height: h } = grid;
  return [0, w - 1, (h - 1) * w, h * w - 1].filter((i) => grid.cells[i] === "#");
}

/** Top-left cells of every 2×2 all-black block. */
export function blackBlocks(grid: Grid): number[] {
  const { width: w, height: h } = grid;
  const out: number[] = [];
  for (let r = 0; r + 1 < h; r++) {
    for (let c = 0; c + 1 < w; c++) {
      const i = r * w + c;
      if (grid.cells[i] === "#" && grid.cells[i + 1] === "#" && grid.cells[i + w] === "#" && grid.cells[i + w + 1] === "#") out.push(i);
    }
  }
  return out;
}

export function meetsGridStandards(grid: Grid): boolean {
  return (!cornersMustBeWhite(grid) || !blackCorners(grid).length) && !blackBlocks(grid).length;
}

/** Seed slots, and the slots the symmetry mirrors them into, may stay long. */
export function isThemeSlot(grid: Grid, cells: number[], symmetry: Symmetry): boolean {
  return cells.every((i) => grid.locked[i]) || cells.every((i) => partners(grid, i, symmetry).some((j) => grid.locked[j]));
}

export const MIN_RUN = 3;

/** Blacks `i` and its symmetric partners. False if any of them is locked or lettered. */
export function setBlack(grid: Grid, i: number, symmetry: Symmetry): boolean {
  const group = partners(grid, i, symmetry);
  if (group.some((j) => grid.locked[j] || (grid.cells[j] && grid.cells[j] !== "#"))) return false;
  for (const j of group) grid.cells[j] = "#";
  return true;
}

/** Blacks out runs of 1–2 squares. False if a short run holds a seed letter. */
export function fixShortRuns(grid: Grid, symmetry: Symmetry): boolean {
  for (let guard = 0; guard < grid.cells.length; guard++) {
    const short = runsOf(grid).find((s) => s.cells.length < MIN_RUN);
    if (!short) return true;
    for (const i of short.cells) if (grid.cells[i] !== "#" && !setBlack(grid, i, symmetry)) return false;
  }
  return false;
}
