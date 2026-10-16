/**
 * Puzzle insights for the studio's admin panel: per-puzzle opens, attempts,
 * solves, platforms and narrator outcomes, and per-clue difficulty, read
 * through the token-gated studio-insights edge function (the aggregate SQL
 * functions in supabase/migrations/20261017200000_play_insights_detail.sql).
 * The pure helpers here (ranges, ranking, formatting) are what the tests cover.
 */
import { studioHeaders } from "./studioAuth";
import { StudioClaudeError } from "./seedgrid/studioClaude";

export interface PuzzleInsight {
  puzzle_key: string;
  puzzle_title: string;
  width: number;
  height: number;
  opens: number;
  attempted: number;
  solves: number;
  median_active_seconds: number | null;
  solo: number;
  multiplayer: number;
  signed_in: number;
  by_client: Record<string, number>;
  by_platform: Record<string, number>;
  by_source: Record<string, number>;
  narrator_connected: number;
  narrator_failed: number;
  last_played: string;
}

export interface ClueInsight {
  clue: string;
  letters: number;
  attempts: number;
  solves: number;
  avg_solve_seconds: number | null;
  median_solve_seconds: number | null;
  wrong_letters: number;
  crossing_letters: number;
  unsolved: number;
}

export type InsightRange = 7 | 14 | 30 | 90;
export const INSIGHT_RANGES: InsightRange[] = [7, 14, 30, 90];

/** [from, to) for the last `days` days up to now, as ISO strings. */
export function rangeBounds(days: InsightRange, now: Date = new Date()): { from: string; to: string } {
  const to = new Date(now.getTime() + 60_000);
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Share as a whole percent, or null when there is no denominator. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((100 * part) / whole) : null;
}

/** "1:23" / "12:05" / "1:02:03" for a number of seconds; "—" when unknown. */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * How hard a clue was to enter, from its aggregate: the median seconds from
 * first focus to solve, plus a penalty per wrong letter typed into it and for
 * every focus that never became a solve. Higher is harder. Clues nobody
 * focused score 0.
 */
export function clueHardness(c: ClueInsight): number {
  if (c.attempts === 0) return 0;
  const time = c.median_solve_seconds ?? c.avg_solve_seconds ?? 0;
  const wrongPerAttempt = c.wrong_letters / c.attempts;
  const unsolvedRate = c.unsolved / c.attempts;
  return time + 15 * wrongPerAttempt + 60 * unsolvedRate;
}

/** Clues with any attempts, hardest first; ties by wrong letters, then by clue id. */
export function hardestClues(clues: ClueInsight[]): ClueInsight[] {
  return clues
    .filter((c) => c.attempts > 0)
    .map((c) => ({ c, h: clueHardness(c) }))
    .sort((a, b) => b.h - a.h || b.c.wrong_letters - a.c.wrong_letters || compareClueIds(a.c.clue, b.c.clue))
    .map((x) => x.c);
}

/** "1A" < "2A" < "10A" < "1D": numeric within a direction, across before down. */
export function compareClueIds(a: string, b: string): number {
  const pa = /^(\d+)([AD])$/.exec(a);
  const pb = /^(\d+)([AD])$/.exec(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa[2].localeCompare(pb[2]) || Number(pa[1]) - Number(pb[1]);
}

/** Totals across every puzzle row, for the panel's header line. */
export function summarize(rows: PuzzleInsight[]): { opens: number; attempted: number; solves: number; signedIn: number; narratorConnected: number; narratorFailed: number; byPlatform: Record<string, number> } {
  const byPlatform: Record<string, number> = {};
  const sum = { opens: 0, attempted: 0, solves: 0, signedIn: 0, narratorConnected: 0, narratorFailed: 0 };
  for (const r of rows) {
    sum.opens += r.opens;
    sum.attempted += r.attempted;
    sum.solves += r.solves;
    sum.signedIn += r.signed_in;
    sum.narratorConnected += r.narrator_connected;
    sum.narratorFailed += r.narrator_failed;
    for (const [k, v] of Object.entries(r.by_platform)) byPlatform[k] = (byPlatform[k] ?? 0) + v;
  }
  return { ...sum, byPlatform };
}

/** "iOS Safari 12 · Android app 9 · …", biggest first, capped. */
export function describeBreakdown(counts: Record<string, number>, max = 4): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const shown = entries.slice(0, max).map(([k, v]) => `${k} ${v}`);
  const rest = entries.slice(max).reduce((n, [, v]) => n + v, 0);
  if (rest) shown.push(`other ${rest}`);
  return shown.join(" · ") || "—";
}

async function call<T>(token: string, body: unknown): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new StudioClaudeError("config", "Supabase isn't configured in this build.");
  const res = await fetch(`${url}/functions/v1/studio-insights`, {
    method: "POST",
    headers: await studioHeaders(token),
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new StudioClaudeError("token", "Sign in as a studio admin, or enter the studio token.");
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new StudioClaudeError("failed", `Insights request failed (${data.error ?? res.status}).`);
  return data;
}

export const fetchPuzzleInsights = (token: string, days: InsightRange) =>
  call<{ puzzles: PuzzleInsight[] }>(token, { action: "puzzles", ...rangeBounds(days) }).then((r) => r.puzzles);

export const fetchClueInsights = (token: string, puzzleKey: string, days: InsightRange) =>
  call<{ clues: ClueInsight[] }>(token, { action: "clues", puzzleKey, ...rangeBounds(days) }).then((r) => r.clues);
