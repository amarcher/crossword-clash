/**
 * Stats (docs/plus-expansion-spec.md §3; migrations 20261118000000_stats.sql
 * and 20261119000000_stats_free.sql). The server answers every caller about
 * themselves: their daily results, and the friends they share dailies with.
 * Plus adds what compares them with others and where they struggle: the share
 * of solvers they beat each day, the head-to-head records and their slowest
 * clues. A free caller is sent none of those figures, only how many slow clues
 * there are. The rest is pure arithmetic here, tested in stats.test.ts.
 */
import { supabase } from "./supabaseClient";
import type { DailySlot } from "./dailyFeed";

export interface DailyResult {
  day: string;
  slot: DailySlot;
  seconds: number;
  solvers: number;
  /** Share of the other solvers that day who were slower, 0–1; null when alone, and for a caller without Plus. */
  fasterThan: number | null;
}

export interface HeadToHead {
  friendId: string;
  username: string;
  played: number;
  /** The record is Plus: null for a free caller, who is told only `played`. */
  wins: number | null;
  losses: number | null;
  ties: number | null;
}

export interface SlowClue {
  puzzleTitle: string;
  clue: string;
  seconds: number;
  day: string;
}

export interface StatsData {
  results: DailyResult[];
  headToHead: HeadToHead[];
  slowClues: SlowClue[];
  /** A free caller's teaser: how many clues took over a minute. Null for Plus (who has the clues) and when unknown. */
  slowClueCount: number | null;
}

/** Everything the page shows since a day. A caller without Plus gets their own times and the counts behind the locked cards. */
export async function fetchStats(since: string, plus: boolean): Promise<StatsData> {
  if (!supabase) return { results: [], headToHead: [], slowClues: [], slowClueCount: null };
  const [results, h2h, clues, clueCount] = await Promise.all([
    supabase.rpc("my_daily_results", { p_since: since }),
    supabase.rpc("my_head_to_head", { p_since: since }),
    plus ? supabase.rpc("my_slow_clues", { p_since: since }) : null,
    plus ? null : supabase.rpc("my_slow_clue_count", { p_since: since }),
  ]);
  if (results.error) throw new Error(results.error.message);
  return {
    slowClueCount: typeof clueCount?.data === "number" ? clueCount.data : null,
    results: (results.data ?? [])
      .filter((r) => r.slot === "mini" || r.slot === "midi" || r.slot === "large")
      .map((r) => ({ day: r.day, slot: r.slot as DailySlot, seconds: r.seconds, solvers: r.solvers, fasterThan: r.faster_than === null ? null : Number(r.faster_than) })),
    headToHead: (h2h.data ?? []).map((r) => ({ friendId: r.friend_id, username: r.username, played: r.played, wins: r.wins, losses: r.losses, ties: r.ties })),
    slowClues: (clues?.data ?? []).map((r) => ({ puzzleTitle: r.puzzle_title, clue: r.clue, seconds: r.seconds, day: r.played_on })),
  };
}

// --- Pure ---

export interface SlotSummary {
  count: number;
  average: number | null;
  best: DailyResult | null;
  /** The mean share of solvers beaten, over the days with others. */
  fasterThan: number | null;
}

export function summarizeSlot(results: readonly DailyResult[]): SlotSummary {
  if (results.length === 0) return { count: 0, average: null, best: null, fasterThan: null };
  const total = results.reduce((sum, r) => sum + r.seconds, 0);
  const best = results.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  const ranked = results.filter((r) => r.fasterThan !== null);
  return {
    count: results.length,
    average: Math.round(total / results.length),
    best,
    fasterThan: ranked.length ? ranked.reduce((sum, r) => sum + (r.fasterThan ?? 0), 0) / ranked.length : null,
  };
}

/** The results from the last `days` days, today included. */
export function lastDays(results: readonly DailyResult[], today: string, days: number): DailyResult[] {
  const [y, m, d] = today.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, d) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return results.filter((r) => r.day >= from && r.day <= today);
}

/** How many results had someone else on the board to be ranked against. */
export function rankedCount(results: readonly DailyResult[]): number {
  return results.filter((r) => r.solvers > 1).length;
}

/** Monday-first weekday of a "YYYY-MM-DD" day: 0 Monday … 6 Sunday. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Average seconds per weekday (Monday first); null for a weekday with no result. */
export function averageByWeekday(results: readonly DailyResult[]): (number | null)[] {
  const sums = Array.from({ length: 7 }, () => ({ total: 0, n: 0 }));
  for (const r of results) {
    const w = sums[weekdayOf(r.day)];
    w.total += r.seconds;
    w.n += 1;
  }
  return sums.map((w) => (w.n ? Math.round(w.total / w.n) : null));
}

/** The last `weeks` weeks of days, Monday-first columns ending with the week holding `today`; each day solved, repaired, or neither. */
export function calendarWeeks(solvedDays: ReadonlySet<string>, repairedDays: ReadonlySet<string>, today: string, weeks = 26): { day: string; state: "solved" | "repaired" | "none" | "future" }[][] {
  const [y, m, d] = today.split("-").map(Number);
  const end = Date.UTC(y, m - 1, d);
  const lastMonday = end - weekdayOf(today) * 86_400_000;
  const start = lastMonday - (weeks - 1) * 7 * 86_400_000;
  const out: { day: string; state: "solved" | "repaired" | "none" | "future" }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: { day: string; state: "solved" | "repaired" | "none" | "future" }[] = [];
    for (let i = 0; i < 7; i++) {
      const t = start + (w * 7 + i) * 86_400_000;
      const day = new Date(t).toISOString().slice(0, 10);
      col.push({ day, state: t > end ? "future" : repairedDays.has(day) ? "repaired" : solvedDays.has(day) ? "solved" : "none" });
    }
    out.push(col);
  }
  return out;
}
