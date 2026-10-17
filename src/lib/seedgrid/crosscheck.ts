/**
 * Pure helpers for `pnpm seedgrid:crosscheck` (scripts/seedgrid/crosscheck.mts):
 * the same-day rules for the daily feed. A day's mini, midi and large must not
 * share an entry of 4+ letters, no title may be an entry of its puzzle, and
 * every clue must be present, within `CLUE_MAX`, and not give its answer away.
 */
import { CLUE_MAX, clueGivesAway } from "./audit";
import type { DailySlot } from "../dailyFeed";
import type { TransferPuzzle } from "../puzzleNormalizer";

/** Entries shared between two of a day's puzzles count from this length; threes are everyday glue. */
export const SHARED_MIN_LENGTH = 4;

/** Runs of letters this long or longer are entries (a two-letter run is a construction fault, not a word). */
export const ENTRY_MIN_LENGTH = 3;

/**
 * Every across and down run of `minLength`+ white cells in a grid given as
 * rows ("#" or "." for black). Reading order: across runs row by row, then
 * down runs column by column.
 */
export function entriesFromRows(rows: string[], minLength = ENTRY_MIN_LENGTH): string[] {
  const black = (ch: string | undefined) => ch === undefined || ch === "#" || ch === ".";
  const out: string[] = [];
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  for (let r = 0; r < height; r++) {
    let run = "";
    for (let c = 0; c <= width; c++) {
      const ch = rows[r][c];
      if (black(ch)) {
        if (run.length >= minLength) out.push(run);
        run = "";
      } else run += ch;
    }
  }
  for (let c = 0; c < width; c++) {
    let run = "";
    for (let r = 0; r <= height; r++) {
      const ch = rows[r]?.[c];
      if (black(ch)) {
        if (run.length >= minLength) out.push(run);
        run = "";
      } else run += ch;
    }
  }
  return out.map((w) => w.toUpperCase());
}

/** The feed's flat row-major grid ("." black) as rows. */
export function rowsFromTransfer(puzzle: Pick<TransferPuzzle, "size" | "grid">): string[] {
  const { rows, cols } = puzzle.size;
  return Array.from({ length: rows }, (_, r) => puzzle.grid.slice(r * cols, (r + 1) * cols).map((c) => (c === "." || c === "#" || !c ? "#" : c)).join(""));
}

export function entriesFromTransfer(puzzle: Pick<TransferPuzzle, "size" | "grid">): string[] {
  return entriesFromRows(rowsFromTransfer(puzzle));
}

/** Entries of `minLength`+ letters that appear in both lists, each once, in `a`'s order. */
export function sharedEntries(a: string[], b: string[], minLength = SHARED_MIN_LENGTH): string[] {
  const inB = new Set(b.map((w) => w.toUpperCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of a) {
    const w = raw.toUpperCase();
    if (w.length < minLength || !inB.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/** A title squashed to letters ("Sunken Treasure" → SUNKENTREASURE), for comparing with entries. */
export function titleAsEntry(title: string): string {
  return title.toUpperCase().replace(/[^A-Z]/g, "");
}

/** The feed stores clues as "12. Clue text"; the number is not part of the clue. */
export function stripClueNumber(clue: string): string {
  return clue.replace(/^\s*\d+[.)]?\s*/, "");
}

export interface ClueIssue {
  dir: "across" | "down";
  /** Position in the direction's list (0-based), since the feed carries no slot ids. */
  index: number;
  answer: string;
  clue: string;
  problem: "empty" | "too long" | "gives away answer";
}

/** Clue checks over a feed puzzle: empty, longer than `CLUE_MAX`, or containing its answer. */
export function clueIssues(puzzle: Pick<TransferPuzzle, "clues" | "answers">): ClueIssue[] {
  const issues: ClueIssue[] = [];
  for (const dir of ["across", "down"] as const) {
    const clues = puzzle.clues[dir] ?? [];
    const answers = puzzle.answers[dir] ?? [];
    clues.forEach((raw, index) => {
      const clue = stripClueNumber(raw);
      const answer = (answers[index] ?? "").toUpperCase();
      const problem: ClueIssue["problem"] | null = !clue.trim() ? "empty" : clue.length > CLUE_MAX ? "too long" : answer && clueGivesAway(clue, answer) ? "gives away answer" : null;
      if (problem) issues.push({ dir, index, answer, clue, problem });
    });
  }
  return issues;
}

export interface DayPuzzle {
  slot: DailySlot;
  puzzle: TransferPuzzle;
}

export interface DayReport {
  day: string;
  /** Which slots had a file, with their titles and entry counts, for the summary line. */
  present: { slot: DailySlot; title: string; size: string; entries: number }[];
  /** Every rule broken that day, one line each; empty means the day is clean. */
  problems: string[];
}

/** Applies the three same-day rules to whatever puzzles a day has. */
export function crosscheckDay(day: string, puzzles: DayPuzzle[]): DayReport {
  const problems: string[] = [];
  const sets = puzzles.map(({ slot, puzzle }) => ({ slot, title: puzzle.title ?? "", entries: entriesFromTransfer(puzzle), puzzle }));
  for (const p of sets) {
    const title = titleAsEntry(p.title);
    if (title && p.entries.includes(title)) problems.push(`${p.slot}: title "${p.title}" is an entry`);
    for (const i of clueIssues(p.puzzle)) problems.push(`${p.slot}: ${i.dir} clue ${i.index + 1} for ${i.answer} ${i.problem}${i.problem === "empty" ? "" : ` ("${i.clue}")`}`);
  }
  for (let a = 0; a < sets.length; a++) {
    for (let b = a + 1; b < sets.length; b++) {
      const shared = sharedEntries(sets[a].entries, sets[b].entries);
      if (shared.length) problems.push(`${sets[a].slot}/${sets[b].slot} share ${shared.join(", ")}`);
    }
  }
  return {
    day,
    present: sets.map((p) => ({ slot: p.slot, title: p.title, size: `${p.puzzle.size.cols}×${p.puzzle.size.rows}`, entries: p.entries.length })),
    problems,
  };
}

/** Every calendar day from `from` to `to` inclusive, as YYYY-MM-DD. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error(`Bad date range ${from}..${to}`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) days.push(d.toISOString().slice(0, 10));
  return days;
}
