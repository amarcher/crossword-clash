/**
 * iPUZ v2 export. Speed clues (the plain fallback tier) ride along in an
 * extension field; standard readers ignore it.
 */
import { gridFromRows, slotsOf, slotText, type Grid } from "./grid";

export interface ClueSet {
  /** Mid-week difficulty, the clue players see. */
  standard: string;
  /** Plain fast-read version, for hints. */
  speed?: string;
}

export interface IpuzMeta {
  title: string;
  author: string;
  theme?: string;
  notes?: string;
  copyright?: string;
}

export const SPEED_CLUES_KEY = "com.crosswordclash:speedclues";

export function toIpuz(grid: Grid, clues: Record<string, ClueSet>, meta: IpuzMeta) {
  const slots = slotsOf(grid);
  const numberAt = new Map<number, number>();
  for (const s of slots) if (!numberAt.has(s.cells[0])) numberAt.set(s.cells[0], s.number);
  const rows = (fn: (i: number) => string | number) =>
    Array.from({ length: grid.height }, (_, r) => Array.from({ length: grid.width }, (_, c) => fn(r * grid.width + c)));
  const list = (dir: "across" | "down", tier: "standard" | "speed") =>
    slots
      .filter((s) => s.dir === dir)
      .map((s) => {
        const set = clues[s.id];
        const text = tier === "speed" ? set?.speed ?? set?.standard : set?.standard;
        return [s.number, text ?? slotText(grid, s)] as [number, string];
      });
  return {
    version: "http://ipuz.org/v2",
    kind: ["http://ipuz.org/crossword#1"],
    dimensions: { width: grid.width, height: grid.height },
    title: meta.title,
    author: meta.author,
    ...(meta.copyright ? { copyright: meta.copyright } : {}),
    ...(meta.notes || meta.theme ? { notes: meta.notes ?? meta.theme } : {}),
    block: "#",
    empty: 0,
    puzzle: rows((i) => (grid.cells[i] === "#" ? "#" : numberAt.get(i) ?? 0)),
    solution: rows((i) => grid.cells[i] || "#"),
    clues: { Across: list("across", "standard"), Down: list("down", "standard") },
    [SPEED_CLUES_KEY]: { Across: list("across", "speed"), Down: list("down", "speed") },
  };
}

/**
 * The app's link-transfer format (puzzleNormalizer's TransferPuzzle), for
 * opening a studio grid straight in the solver. Entries without a clue get a
 * placeholder so a play test works before cluing is done.
 */
export function toTransferPuzzle(grid: Grid, clues: Record<string, ClueSet>, meta: Pick<IpuzMeta, "title" | "author">) {
  const slots = slotsOf(grid);
  const gridnums = Array(grid.cells.length).fill(0);
  for (const s of slots) gridnums[s.cells[0]] = s.number;
  const side = (dir: "across" | "down") => slots.filter((s) => s.dir === dir);
  const clueText = (id: string) => clues[id]?.standard?.trim() || "(no clue yet)";
  return {
    title: meta.title || "Untitled",
    author: meta.author,
    size: { rows: grid.height, cols: grid.width },
    grid: grid.cells.map((c) => (c === "#" ? "." : c)),
    gridnums,
    clues: {
      across: side("across").map((s) => `${s.number}. ${clueText(s.id)}`),
      down: side("down").map((s) => `${s.number}. ${clueText(s.id)}`),
    },
    answers: { across: side("across").map((s) => slotText(grid, s)), down: side("down").map((s) => slotText(grid, s)) },
  };
}

/** The subset of an iPUZ file the editing CLIs read back (`gridFromIpuz`, `cluesFromIpuz`). */
export interface IpuzFile {
  title?: string;
  author?: string;
  notes?: string;
  copyright?: string;
  dimensions?: { width: number; height: number };
  solution: (string | number | null)[][];
  clues: { Across: [number, string][]; Down: [number, string][] };
  [SPEED_CLUES_KEY]?: { Across: [number, string][]; Down: [number, string][] };
}

/**
 * The grid a `toIpuz` file describes. Nothing is locked: callers who know the
 * theme entries (a session.json's seeds, a studio.json's locks) set that.
 */
export function gridFromIpuz(ipuz: Pick<IpuzFile, "solution">): Grid {
  return gridFromRows(ipuz.solution.map((row) => row.map((c) => (c === "#" || c === null || c === 0 ? "#" : String(c))).join("")));
}

/**
 * Slot id → clue tiers, from the file's standard list and the speed-clue
 * extension. `toIpuz` writes the answer itself where a slot has no clue, so a
 * clue equal to its answer is read back as missing.
 */
export function cluesFromIpuz(ipuz: Pick<IpuzFile, "clues" | typeof SPEED_CLUES_KEY>, grid: Grid): Record<string, ClueSet> {
  const byNumber = (list: [number, string][] | undefined) => new Map((list ?? []).map(([n, text]) => [n, text]));
  const standard = { across: byNumber(ipuz.clues?.Across), down: byNumber(ipuz.clues?.Down) };
  const speedLists = ipuz[SPEED_CLUES_KEY];
  const speed = speedLists ? { across: byNumber(speedLists.Across), down: byNumber(speedLists.Down) } : null;
  const clues: Record<string, ClueSet> = {};
  for (const s of slotsOf(grid)) {
    const text = standard[s.dir].get(s.number);
    if (text === undefined || text === slotText(grid, s)) continue;
    const fast = speed?.[s.dir].get(s.number);
    clues[s.id] = { standard: text, ...(fast !== undefined && fast !== text ? { speed: fast } : {}) };
  }
  return clues;
}
