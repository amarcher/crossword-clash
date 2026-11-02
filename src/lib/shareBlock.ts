/**
 * The spoiler-free result block — the text a finisher shares, the way Wordle's
 * rows are shared. It pastes into any chat, survives every share target, and
 * carries the challenge link as its last line.
 *
 * ```
 * Crossword Clash · Daily Mini · Oct 20
 * ⏱ 1:42 · 🔥 5-day streak
 * ⬛🟩🟩🟩🟩
 * 🟩🟩🟨🟨🟩
 * 🟩🟨🟨🟧🟧
 * 🟩🟩🟧🟧🟥
 * 🟩🟩🟩🟧⬛
 * Beat my time → https://crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer
 * ```
 *
 * Rows are the grid's rows: ⬛ a block, 🟩/🟨/🟧 a cell filled in the first /
 * middle / last third of the solve, 🟥 a cell that took a wrong letter first.
 * No letters, so nothing is spoiled; the shape plus the pace tells the story.
 *
 * What 🟥 means depends on how the puzzle was played (`wrongCells` is the
 * caller's): with Autocheck on it is a square where a wrong letter was refused;
 * with Autocheck off (soloSettings.ts) nothing is refused, so it is a square
 * that was still wrong when the solver asked for a check, or that they had
 * revealed. A wrong letter the solver fixed on their own never shows.
 * Grids wider than MAX_ROW_WIDTH get one 15-block pace bar instead of rows.
 * A live race colours cells by who claimed them, in the player-colour order.
 *
 * Pure: no DOM, no i18n (labels come in interpolated), no clock. Tested in
 * shareBlock.test.ts.
 */

import { PLAYER_COLORS } from "./playerColors";
import { formatDuration } from "./soloStats";
import type { CellState, Puzzle } from "../types/puzzle";

/** Widest grid that is shown row by row; wider ones get the pace bar. */
export const MAX_ROW_WIDTH = 9;
/** Length of the pace bar for wide grids. */
export const PACE_BAR_BLOCKS = 15;

export const BLACK = "⬛";
export const EMPTY = "⬜";
export const WRONG = "🟥";
/** First / middle / last third of the solve. */
export const PACE = ["🟩", "🟨", "🟧"] as const;
/** The player-colour pool (blue, red, green, amber, violet, pink, cyan, orange) as squares. */
export const PLAYER_SQUARES = ["🟦", "🟥", "🟩", "🟨", "🟪", "🟧", "🟦", "🟫"] as const;

export interface ShareBlockLabels {
  /** "Crossword Clash". */
  brand: string;
  /** "Daily Mini" when the puzzle was a daily; the header then carries the date, not the title. */
  daily?: string;
  /** Already interpolated, e.g. "5-day streak"; omit when there is no streak to show. */
  streak?: string;
  /** Multiplayer standing or team line, already interpolated, e.g. "Finished #3 of 5". */
  standing?: string;
  /** "Beat my time" when a time is shared; "Play it" otherwise. */
  cta: string;
}

export interface ShareBlockInput {
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells">;
  /** "row,col" → state, as the solver holds it. */
  cells: Record<string, Pick<CellState, "correct" | "playerId" | "at">>;
  /** "row,col" keys of cells that were answered wrong at least once. */
  wrongCells?: Iterable<string>;
  /** Finish time, whole seconds. */
  seconds?: number;
  /** Local calendar day (YYYY-MM-DD) of a daily, shown in the header. */
  day?: string;
  /** BCP 47 tag for the header date; the runtime default when omitted. */
  locale?: string;
  /**
   * Live race: hex colour per player id (from the lobby's colour assignment).
   * When present, cells are coloured by claimant instead of pace.
   */
  playerColors?: Record<string, string>;
  /** The challenge link, already built. */
  link: string;
  labels: ShareBlockLabels;
}

export interface ShareBlock {
  header: string;
  /** The stats line, or null when there is nothing to say (no time, no streak, no standing). */
  stats: string | null;
  /** One string per grid row, or a single pace bar for wide grids. */
  grid: string[];
  /** "Beat my time →" — the call to action without the link. */
  cta: string;
  link: string;
  /** Everything above the link line, for share sheets that take the URL as its own item. */
  body: string;
  /** The whole block, link included — what the clipboard and the Web Share API get. */
  text: string;
}

/** Local-calendar date from a YYYY-MM-DD key, formatted "Oct 20" (locale-aware). */
export function formatShareDay(day: string, locale?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
  } catch {
    return day;
  }
}

/** The emoji square for a player's hex colour; the pool order maps to PLAYER_SQUARES. */
export function playerSquare(hex: string | undefined): string {
  if (!hex) return EMPTY;
  const index = (PLAYER_COLORS as readonly string[]).indexOf(hex.toLowerCase());
  return index === -1 ? EMPTY : PLAYER_SQUARES[index % PLAYER_SQUARES.length];
}

/**
 * "🟦 Archer, 🟥 Alicia" — each player's square and name, for the legend under
 * the preview of a race block. The squares follow the players' hex colours, so
 * pass the frozen record's roster and the legend matches the rows whoever is
 * still in the room.
 */
export function claimantLegend(players: readonly { displayName: string; color: string }[]): string {
  return players.map((p) => `${playerSquare(p.color)} ${p.displayName}`).join(", ");
}

/** Which third of [start, end] `at` falls in: 0, 1 or 2. A degenerate span is all first-third. */
export function paceThird(at: number | undefined, start: number, end: number): 0 | 1 | 2 {
  if (at === undefined || end <= start) return 0;
  const f = (at - start) / (end - start);
  if (f < 1 / 3) return 0;
  if (f < 2 / 3) return 1;
  return 2;
}

interface Timing {
  start: number;
  end: number;
}

/** Earliest and latest fill times among the filled cells, or null when nothing is timed. */
function timing(cells: ShareBlockInput["cells"]): Timing | null {
  let start = Infinity;
  let end = -Infinity;
  for (const c of Object.values(cells)) {
    if (!c.correct || c.at === undefined) continue;
    if (c.at < start) start = c.at;
    if (c.at > end) end = c.at;
  }
  return start === Infinity ? null : { start, end };
}

/** One row of squares per grid row. */
export function gridRows(input: ShareBlockInput): string[] {
  const { puzzle, cells, playerColors } = input;
  const wrong = new Set(input.wrongCells ?? []);
  const span = timing(cells);
  const rows: string[] = [];
  for (let r = 0; r < puzzle.height; r++) {
    let row = "";
    for (let c = 0; c < puzzle.width; c++) {
      const solution = puzzle.cells[r]?.[c]?.solution ?? null;
      if (solution === null) {
        row += BLACK;
        continue;
      }
      const key = `${r},${c}`;
      const state = cells[key];
      if (!state?.correct) {
        row += EMPTY;
      } else if (playerColors) {
        row += playerSquare(state.playerId ? playerColors[state.playerId] : undefined);
      } else if (wrong.has(key)) {
        row += WRONG;
      } else {
        row += PACE[paceThird(state.at, span?.start ?? 0, span?.end ?? 0)];
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * A 15-block pace bar for wide grids: the solve split into equal time windows,
 * each coloured by how many cells landed in it against the average (🟩 fast,
 * 🟨 even, 🟧 slow), 🟥 when a wrong-answered cell was filled in it. A live
 * race shows whichever player claimed most in each window.
 */
export function paceBar(input: ShareBlockInput, blocks: number = PACE_BAR_BLOCKS): string {
  const { cells, playerColors } = input;
  const wrong = new Set(input.wrongCells ?? []);
  const span = timing(cells);
  const timed = Object.entries(cells).filter(([, c]) => c.correct && c.at !== undefined);
  if (!span || span.end <= span.start || timed.length === 0) {
    return (playerColors ? EMPTY : PACE[1]).repeat(blocks);
  }
  const counts = new Array<number>(blocks).fill(0);
  const wrongIn = new Array<boolean>(blocks).fill(false);
  const claims: Map<string, number>[] = Array.from({ length: blocks }, () => new Map());
  for (const [key, c] of timed) {
    const f = ((c.at as number) - span.start) / (span.end - span.start);
    const i = Math.min(blocks - 1, Math.floor(f * blocks));
    counts[i]++;
    if (wrong.has(key)) wrongIn[i] = true;
    if (c.playerId) claims[i].set(c.playerId, (claims[i].get(c.playerId) ?? 0) + 1);
  }
  // A window is fast or slow when it is a quarter away from the average, and
  // by at least one whole cell, so a 7×7's two-or-three-per-window jitter
  // reads as even.
  const expected = timed.length / blocks;
  const margin = Math.max(1, expected * 0.25);
  let bar = "";
  for (let i = 0; i < blocks; i++) {
    if (playerColors) {
      let best: string | undefined;
      let bestCount = 0;
      for (const [id, n] of claims[i]) {
        if (n > bestCount) {
          best = id;
          bestCount = n;
        }
      }
      bar += best ? playerSquare(playerColors[best]) : EMPTY;
    } else if (wrongIn[i]) {
      bar += WRONG;
    } else if (counts[i] >= expected + margin) {
      bar += PACE[0];
    } else if (counts[i] <= expected - margin) {
      bar += PACE[2];
    } else {
      bar += PACE[1];
    }
  }
  return bar;
}

/** Build the block. Never throws on odd input (an empty grid gives no rows). */
export function buildShareBlock(input: ShareBlockInput): ShareBlock {
  const { labels } = input;
  const headerParts = [labels.brand];
  if (labels.daily) {
    headerParts.push(labels.daily);
    if (input.day) headerParts.push(formatShareDay(input.day, input.locale));
  } else {
    const title = input.puzzle.title.trim();
    if (title) headerParts.push(title);
  }
  const header = headerParts.join(" · ");

  const statsParts: string[] = [];
  if (input.seconds !== undefined && Number.isFinite(input.seconds)) {
    statsParts.push(`⏱ ${formatDuration(Math.max(0, Math.floor(input.seconds)))}`);
  }
  if (labels.streak) statsParts.push(`🔥 ${labels.streak}`);
  if (labels.standing) statsParts.push(labels.standing);
  const stats = statsParts.length ? statsParts.join(" · ") : null;

  const grid = input.puzzle.width > MAX_ROW_WIDTH ? [paceBar(input)] : gridRows(input);

  const cta = `${labels.cta} →`;
  const body = [header, stats, ...grid].filter((line): line is string => line !== null).join("\n");
  const text = `${body}\n${cta} ${input.link}`;
  return { header, stats, grid, cta, link: input.link, body, text };
}
