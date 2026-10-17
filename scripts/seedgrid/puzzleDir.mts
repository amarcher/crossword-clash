/**
 * A finished puzzle on disk, as `pnpm seedgrid` (puzzle.ipuz + session.json)
 * and `pnpm seedgrid:large` (puzzle.ipuz + studio.json) leave it, for the
 * editing CLIs (timely, reclue, refix) to read and write back in one shape.
 *
 * The grid comes from studio.json when there is one (it carries the locks),
 * else from the ipuz solution with the session's seeds locked. Clues come
 * from the ipuz (what gets published), else from studio.json. Saving writes
 * every file that exists so they never drift.
 */
import fs from "node:fs";
import path from "node:path";
import { gridToRows, slotsOf, slotText, type Grid, type Slot, type Symmetry } from "../../src/lib/seedgrid/grid";
import { normalizeEntry } from "../../src/lib/seedgrid/dictionary";
import { cluesFromIpuz, gridFromIpuz, toIpuz, type ClueSet, type IpuzFile } from "../../src/lib/seedgrid/ipuz";
import { slotKey, type StudioState } from "../../src/lib/seedgrid/studioState";
import type { Difficulty } from "../../src/lib/seedgrid/cluePrompt";

/** What make.mts writes beside puzzle.ipuz. */
export interface SessionFile {
  theme?: string;
  title?: string;
  explanation?: string;
  seeds?: string[];
  symmetry?: Symmetry;
  minScore?: number;
  maxShared?: number;
  skeleton?: string[];
  fill?: string[];
  approved?: Record<string, string[]>;
  rejected?: string[];
  /** Added by the editing CLIs: slot id → clue tiers as last written. */
  clues?: Record<string, ClueSet>;
  difficulty?: Difficulty;
}

export interface PuzzleDir {
  dir: string;
  grid: Grid;
  slots: Slot[];
  /** Slot id → entry. */
  answers: Record<string, string>;
  clues: Record<string, ClueSet>;
  /** Theme entries: locked slots (studio) or the session's seeds. */
  seeds: string[];
  theme: string;
  title: string;
  author: string;
  difficulty: Difficulty;
  rejected: string[];
  ipuz: IpuzFile | null;
  studio: StudioState | null;
  session: SessionFile | null;
}

function readJson<T>(file: string): T | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null;
}

export function loadPuzzleDir(dir: string): PuzzleDir {
  const ipuz = readJson<IpuzFile>(path.join(dir, "puzzle.ipuz"));
  const studio = readJson<StudioState>(path.join(dir, "studio.json"));
  const session = readJson<SessionFile>(path.join(dir, "session.json"));
  if (!ipuz && !studio) throw new Error(`${dir} has neither puzzle.ipuz nor studio.json`);

  let grid: Grid;
  if (studio) grid = { ...studio.grid, cells: studio.grid.cells.slice(), locked: studio.grid.locked.slice() };
  else {
    grid = gridFromIpuz(ipuz!);
    const seeds = new Set((session?.seeds ?? []).map(normalizeEntry));
    for (const s of slotsOf(grid)) if (seeds.has(slotText(grid, s))) for (const i of s.cells) grid.locked[i] = true;
  }
  const slots = slotsOf(grid);
  const answers = Object.fromEntries(slots.map((s) => [s.id, slotText(grid, s)]));
  const seeds = slots.filter((s) => s.cells.every((i) => grid.locked[i])).map((s) => answers[s.id]);

  let clues: Record<string, ClueSet> = {};
  if (ipuz) clues = cluesFromIpuz(ipuz, grid);
  else if (studio) {
    for (const s of slots) {
      const k = slotKey(s);
      if (studio.clues?.[k]) clues[s.id] = { standard: studio.clues[k], ...(studio.speedClues?.[k] ? { speed: studio.speedClues[k] } : {}) };
    }
  }

  return {
    dir,
    grid,
    slots,
    answers,
    clues,
    seeds,
    theme: studio?.theme ?? session?.theme ?? ipuz?.notes ?? "",
    title: ipuz?.title ?? studio?.title ?? session?.title ?? "",
    author: ipuz?.author ?? "Crossword Clash",
    difficulty: studio?.difficulty ?? session?.difficulty ?? "medium",
    rejected: studio?.rejected ?? session?.rejected ?? [],
    ipuz,
    studio,
    session,
  };
}

export interface PuzzleChanges {
  clues: Record<string, ClueSet>;
  /** A new fill of the same skeleton (refix); the locks are kept. */
  grid?: Grid;
  difficulty?: Difficulty;
  rejected?: string[];
}

/** Writes puzzle.ipuz, and studio.json / session.json where they exist, with the given clues (and grid). */
export function savePuzzleDir(p: PuzzleDir, changes: PuzzleChanges): void {
  const grid = changes.grid ?? p.grid;
  const slots = slotsOf(grid);
  const ipuz = toIpuz(grid, changes.clues, { title: p.title, author: p.author, theme: p.theme || undefined, ...(p.ipuz?.copyright ? { copyright: p.ipuz.copyright } : {}) });
  fs.writeFileSync(path.join(p.dir, "puzzle.ipuz"), JSON.stringify(ipuz, null, 2) + "\n");
  if (p.studio) {
    const studio: StudioState = {
      ...p.studio,
      grid,
      clues: Object.fromEntries(slots.filter((s) => changes.clues[s.id]).map((s) => [slotKey(s), changes.clues[s.id].standard])),
      speedClues: Object.fromEntries(slots.filter((s) => changes.clues[s.id]?.speed).map((s) => [slotKey(s), changes.clues[s.id].speed!])),
      ...(changes.difficulty ? { difficulty: changes.difficulty } : {}),
      ...(changes.rejected ? { rejected: changes.rejected } : {}),
    };
    fs.writeFileSync(path.join(p.dir, "studio.json"), JSON.stringify(studio, null, 2) + "\n");
  }
  if (p.session) {
    const session: SessionFile = {
      ...p.session,
      ...(changes.grid ? { fill: gridToRows(changes.grid) } : {}),
      clues: Object.fromEntries(slots.filter((s) => changes.clues[s.id]).map((s) => [s.id, changes.clues[s.id]])),
      ...(changes.difficulty ? { difficulty: changes.difficulty } : {}),
      ...(changes.rejected ? { rejected: changes.rejected } : {}),
    };
    fs.writeFileSync(path.join(p.dir, "session.json"), JSON.stringify(session, null, 2) + "\n");
  }
}

export function appendReview(dir: string, lines: string[]): void {
  fs.appendFileSync(path.join(dir, "review.md"), "\n" + lines.join("\n") + "\n");
}

export const today = () => new Date().toISOString().slice(0, 10);

/** `--key value` / `--key` flags and the positional arguments. */
export function parseArgs(argv: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    flags[arg.slice(2)] = next === undefined || next.startsWith("--") ? "true" : (i++, next);
  }
  return { flags, positional };
}

/** Rows of a grid as the review's fenced block. */
export function gridBlock(grid: Grid): string[] {
  return ["```", ...gridToRows(grid), "```"];
}
