/**
 * Pure helpers for `pnpm seedgrid:crosscheck` (scripts/seedgrid/crosscheck.mts):
 * the same-day rules for the daily feed. A day's mini, midi and large must not
 * share an entry of 4+ letters, no title may be an entry of its puzzle, and
 * every clue must be present, within `CLUE_MAX`, and not give its answer away.
 * Across days: no clue repeats, word for word, a clue its answer had in any
 * slot within the previous `CLUE_REPEAT_DAYS` days (`repeatedClues`).
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

// ---- Clue repeats across days ----

/**
 * A clue may not repeat, word for word, a clue its answer had this many days
 * before, in any slot, the same day included. A solver who plays all three
 * dailies sees ERE every few days; "Before, poetically" every time is what
 * they notice (player feedback, 2026-11-07).
 */
export const CLUE_REPEAT_DAYS = 14;

/** The feed is held to the repeat rule from this day on; the days before it were already played. */
export const CLUE_REPEAT_FROM = "2026-11-08";

/**
 * A clue as the repeat rule compares it: without its number, lower case,
 * letters, digits and single spaces only. So "Pub pint" and "Pub pint." are
 * the same clue, while "Rainbow shape" and "Rainbow's shape" are not.
 */
export function clueKey(clue: string): string {
  return stripClueNumber(clue)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One clue of one published puzzle. */
export interface ClueUse {
  day: string;
  slot: DailySlot;
  dir: "across" | "down";
  /** Position in the direction's clue list (0-based). */
  index: number;
  /** The clue's number in the grid (0 when the feed text carries none). */
  number: number;
  answer: string;
  /** The clue text without its number. */
  clue: string;
}

/** Every clued answer of a feed puzzle. */
export function clueUses(day: string, slot: DailySlot, puzzle: Pick<TransferPuzzle, "clues" | "answers">): ClueUse[] {
  return (["across", "down"] as const).flatMap((dir) =>
    (puzzle.clues[dir] ?? []).flatMap((raw, index) => {
      const answer = (puzzle.answers[dir]?.[index] ?? "").toUpperCase();
      const clue = stripClueNumber(raw).trim();
      const number = Number(/^\s*(\d+)/.exec(raw)?.[1] ?? 0);
      return answer && clue ? [{ day, slot, dir, index, number, answer, clue }] : [];
    }),
  );
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Slots in publication order (dailyFeed's DAILY_SLOTS, kept type-only here so the studio's clue code stays light). */
const SLOT_ORDER: readonly DailySlot[] = ["mini", "midi", "large"];

/** Publication order: by day, then mini → midi → large within a day. */
function publishedBefore(a: ClueUse, b: ClueUse): number {
  return a.day.localeCompare(b.day) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || (a.dir === b.dir ? a.index - b.index : a.dir === "across" ? -1 : 1);
}

export interface ClueRepeat {
  /** The later clue, the one that breaks the rule. */
  use: ClueUse;
  /** The most recent earlier use of the same clue for the same answer. */
  earlier: ClueUse;
}

/**
 * Clues that repeat, word for word (`clueKey`), a clue the same answer had
 * within `windowDays` before, the same day's earlier slots included. Only the
 * later use is reported; the first one is the clue that stays.
 */
export function repeatedClues(uses: readonly ClueUse[], windowDays = CLUE_REPEAT_DAYS): ClueRepeat[] {
  const groups = new Map<string, ClueUse[]>();
  for (const u of uses) {
    const key = `${u.answer}|${clueKey(u.clue)}`;
    const list = groups.get(key);
    if (list) list.push(u);
    else groups.set(key, [u]);
  }
  const out: ClueRepeat[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort(publishedBefore);
    for (let i = 1; i < list.length; i++) {
      if (daysBetween(list[i - 1].day, list[i].day) <= windowDays) out.push({ use: list[i], earlier: list[i - 1] });
    }
  }
  return out.sort((a, b) => publishedBefore(a.use, b.use));
}

/** One report line for a repeat, in the cross-check's voice. */
export function repeatProblem({ use, earlier }: ClueRepeat): string {
  const when = earlier.day === use.day ? `the ${earlier.slot} the same day` : `the ${earlier.slot} of ${earlier.day}`;
  const where = use.number ? `${use.number}${use.dir === "across" ? "A" : "D"}` : `${use.dir} clue ${use.index + 1}`;
  return `${use.slot}: ${where} ${use.answer} repeats "${use.clue}" from ${when}`;
}

/**
 * The clues an answer had in other dailies within `windowDays` either side of
 * `day`, each once, oldest first: what a clue writer must not hand back. The
 * puzzle being written (`day` + `slot`) is left out.
 */
export function recentCluesFor(uses: readonly ClueUse[], answer: string, day: string, slot: DailySlot, windowDays = CLUE_REPEAT_DAYS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const target = answer.toUpperCase();
  for (const u of [...uses].sort(publishedBefore)) {
    if (u.answer !== target || (u.day === day && u.slot === slot) || Math.abs(daysBetween(day, u.day)) > windowDays) continue;
    const key = clueKey(u.clue);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u.clue);
  }
  return out;
}
