/**
 * iPUZ v2 export. Speed clues (the plain fallback tier) ride along in an
 * extension field; standard readers ignore it.
 */
import { slotsOf, slotText, type Grid } from "./grid";

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
