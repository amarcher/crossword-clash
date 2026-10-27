/**
 * Solve history for signed-in solvers (solver accounts, phase 2).
 *
 * Anonymous play keeps its history in localStorage (soloStats.ts) and nothing
 * here runs for it. Once an account exists, the Supabase `solves` table is the
 * source of truth: one row per (puzzle, local day), and everything the app
 * shows — best times, the daily streak, the NYT streak, the synced count — is
 * DERIVED from those rows by the pure functions in the first half of this
 * file. Two devices therefore always agree, because they read the same facts
 * and run the same math; nothing stores a counter that could drift.
 *
 * The derivation copies the local rules exactly: a solo finish of any puzzle
 * or a finish of a daily counts toward the daily streak (recordSoloCompletion /
 * recordDailyPlay), and a finish of an NYT-bookmarklet puzzle toward the NYT
 * streak (recordNytPlay). A signed-in solver sees the same numbers they saw
 * before signing in.
 *
 * The second half is the per-session store: fetched once per account, merged
 * optimistically on every finish, uploaded once from the device's pre-account
 * history, and read by the hooks in src/hooks/useSolveHistory.ts.
 */

import { supabase } from "./supabaseClient";
import {
  dayKey,
  daysBetween,
  effectiveStreak,
  isNewBest,
  loadSoloStats,
  EMPTY_STREAK,
  type SoloStats,
  type StreakState,
} from "./soloStats";
import type { Database } from "../types/supabase";

// --- Types ---

export type SolveSource = "daily" | "nyt" | "community" | "other";
export type SolveMode = "solo" | "versus" | "coop" | "async" | "import";

/** One stored finish: the `solves` row without its owner. */
export type SolveRow = Omit<Database["public"]["Tables"]["solves"]["Row"], "user_id">;

/** A finish to record. The day and timestamp default to now. */
export interface SolveInput {
  puzzleKey: string;
  title: string;
  source: SolveSource;
  mode: SolveMode;
  /** Personal finish time in whole seconds, or null for a shared-grid race. */
  seconds: number | null;
  completedDay?: string;
  completedAt?: string;
}

export interface SolveSummary {
  /** puzzleIdentity → best finish time in whole seconds, across all days. */
  bestTimes: Record<string, number>;
  /** Daily-play streak: solo finishes and daily finishes. Display via effectiveStreak(). */
  streak: StreakState;
  /** NYT-bookmarklet streak. Display via effectiveStreak(). */
  nytStreak: StreakState;
  /** Distinct puzzles with a recorded finish (streak markers from an import excluded). */
  solveCount: number;
}

/** What a finish meant, judged against the history as it stood before it. */
export interface SolveOutcome {
  previousBest: number | null;
  bestSeconds: number | null;
  isNewBest: boolean;
  /** The daily streak after this finish, `current` already effective for its day. */
  streak: StreakState;
  /** The NYT streak after this finish, `current` already effective for its day. */
  nytStreak: StreakState;
  summary: SolveSummary;
}

export const EMPTY_SUMMARY: SolveSummary = {
  bestTimes: {},
  streak: { ...EMPTY_STREAK },
  nytStreak: { ...EMPTY_STREAK },
  solveCount: 0,
};

/** Prefix of the puzzle_key of rows that only mark a day of an imported streak. */
export const LEGACY_KEY_PREFIX = "legacy:";

/** The most days of a local streak that are carried over on first sign-in. */
export const MAX_IMPORTED_STREAK_DAYS = 366;

// --- Pure: which rows count ---

export function countsForDailyStreak(row: Pick<SolveRow, "mode" | "source">): boolean {
  return row.mode === "solo" || row.source === "daily";
}

export function countsForNytStreak(row: Pick<SolveRow, "source">): boolean {
  return row.source === "nyt";
}

/** A real finish, as opposed to a streak-day marker written by the import. */
export function isRecordedFinish(row: Pick<SolveRow, "mode" | "seconds">): boolean {
  return row.seconds !== null || row.mode !== "import";
}

// --- Pure: streaks from days ---

/**
 * The streak described by a set of "YYYY-MM-DD" days: `current` is the run of
 * consecutive days ending on the latest one, `longest` the longest run
 * anywhere, and `lastPlayedDay` the latest day. Like the stored local streak,
 * `current` is as of the last play; effectiveStreak() turns it into today's
 * number (0 once a day has been missed).
 */
export function streakFromDays(days: Iterable<string>): StreakState {
  const sorted = [...new Set(days)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (sorted.length === 0) return { ...EMPTY_STREAK };
  let run = 1;
  let longest = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current: run, longest, lastPlayedDay: sorted[sorted.length - 1] };
}

// --- Pure: summary ---

export function summarizeSolves(rows: readonly SolveRow[]): SolveSummary {
  const bestTimes: Record<string, number> = {};
  const dailyDays: string[] = [];
  const nytDays: string[] = [];
  const finished = new Set<string>();
  for (const row of rows) {
    if (row.seconds !== null) {
      const prev = bestTimes[row.puzzle_key];
      if (prev === undefined || row.seconds < prev) bestTimes[row.puzzle_key] = row.seconds;
    }
    if (countsForDailyStreak(row)) dailyDays.push(row.completed_day);
    if (countsForNytStreak(row)) nytDays.push(row.completed_day);
    if (isRecordedFinish(row)) finished.add(row.puzzle_key);
  }
  return {
    bestTimes,
    streak: streakFromDays(dailyDays),
    nytStreak: streakFromDays(nytDays),
    solveCount: finished.size,
  };
}

// --- Pure: merging rows (mirrors record_solves' ON CONFLICT clause) ---

function rowKey(row: Pick<SolveRow, "puzzle_key" | "completed_day">): string {
  return `${row.puzzle_key}\n${row.completed_day}`;
}

function mergeRow(existing: SolveRow, incoming: SolveRow): SolveRow {
  const seconds =
    existing.seconds === null ? incoming.seconds : incoming.seconds === null ? existing.seconds : Math.min(existing.seconds, incoming.seconds);
  const incomingIsFaster = incoming.seconds !== null && (existing.seconds === null || incoming.seconds < existing.seconds);
  return {
    puzzle_key: existing.puzzle_key,
    completed_day: existing.completed_day,
    seconds,
    title: existing.title === "" ? incoming.title : existing.title,
    source: existing.source === "other" ? incoming.source : existing.source,
    mode: existing.mode === "import" || incomingIsFaster ? incoming.mode : existing.mode,
    completed_at: incoming.completed_at > existing.completed_at ? incoming.completed_at : existing.completed_at,
  };
}

/** Fold incoming rows into a history: a repeat of a (puzzle, day) keeps the best of both. */
export function mergeRows(rows: readonly SolveRow[], incoming: readonly SolveRow[]): SolveRow[] {
  const byKey = new Map<string, SolveRow>();
  for (const row of rows) byKey.set(rowKey(row), row);
  for (const row of incoming) {
    const key = rowKey(row);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeRow(existing, row) : row);
  }
  return [...byKey.values()];
}

/** The row a finish becomes. */
export function toSolveRow(input: SolveInput, now: Date = new Date()): SolveRow {
  return {
    puzzle_key: input.puzzleKey,
    title: input.title.slice(0, 200),
    source: input.source,
    mode: input.mode,
    seconds: input.seconds === null ? null : Math.max(0, Math.floor(input.seconds)),
    completed_day: input.completedDay ?? dayKey(now),
    completed_at: input.completedAt ?? now.toISOString(),
  };
}

/**
 * What a finish means against a history: the best it beat (or didn't), and
 * the streaks after it, already effective for the finish's own day.
 */
export function judgeSolve(rows: readonly SolveRow[], row: SolveRow): SolveOutcome {
  const before = summarizeSolves(rows);
  const previousBest = before.bestTimes[row.puzzle_key] ?? null;
  const summary = summarizeSolves(mergeRows(rows, [row]));
  const beat = row.seconds !== null && isNewBest(previousBest, row.seconds);
  return {
    previousBest,
    bestSeconds: summary.bestTimes[row.puzzle_key] ?? null,
    isNewBest: beat,
    streak: { ...summary.streak, current: effectiveStreak(summary.streak, row.completed_day) },
    nytStreak: { ...summary.nytStreak, current: effectiveStreak(summary.nytStreak, row.completed_day) },
    summary,
  };
}

// --- Pure: the one-time import of a device's pre-account history ---

/** The "YYYY-MM-DD" key `n` days before `day`. */
function shiftDay(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The rows that carry a device's localStorage history into an account. Best
 * times become 'import' rows dated today (their real days were never stored;
 * 'other' + 'import' keeps them out of every streak). A streak that is still
 * alive today becomes one marker row per day of its current run, so the
 * server derives the same number; a streak already broken has nothing to
 * carry, and `longest` is not shown anywhere, so it is not preserved.
 */
export function legacyRowsFromStats(stats: SoloStats, today: string, nowIso: string): SolveRow[] {
  const rows: SolveRow[] = [];
  for (const [key, seconds] of Object.entries(stats.bestTimes)) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) continue;
    rows.push({ puzzle_key: key, title: "", source: "other", mode: "import", seconds: Math.floor(seconds), completed_day: today, completed_at: nowIso });
  }
  const markers = (streak: StreakState, source: "daily" | "nyt") => {
    const current = effectiveStreak(streak, today);
    if (current <= 0 || !streak.lastPlayedDay) return;
    const days = Math.min(current, MAX_IMPORTED_STREAK_DAYS);
    for (let i = 0; i < days; i++) {
      const day = shiftDay(streak.lastPlayedDay, i);
      rows.push({ puzzle_key: `${LEGACY_KEY_PREFIX}${source}:${day}`, title: "", source, mode: "import", seconds: null, completed_day: day, completed_at: nowIso });
    }
  };
  markers(stats.streak, "daily");
  markers(stats.nytStreak, "nyt");
  return rows;
}

// --- Impure: the per-session store ---

export type HistoryStatus = "loading" | "ready" | "error";

export interface SolveHistoryState {
  userId: string;
  status: HistoryStatus;
  /** Null until loaded, and after a failed load. */
  rows: SolveRow[] | null;
  /** Derived from `rows`; EMPTY_SUMMARY while they are null. */
  summary: SolveSummary;
}

const UPLOADED_KEY = "crossword-clash:solves-uploaded";
const PAGE = 1000;
const COLUMNS = "puzzle_key, title, source, mode, seconds, completed_day, completed_at";

let state: SolveHistoryState | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: SolveHistoryState | null) {
  state = next;
  emit();
}

function setRows(userId: string, rows: SolveRow[] | null, status: HistoryStatus) {
  setState({ userId, status, rows, summary: rows ? summarizeSolves(rows) : EMPTY_SUMMARY });
}

/** For useSyncExternalStore: the current history, or null while anonymous. */
export function getSolveHistoryState(): SolveHistoryState | null {
  return state;
}

export function subscribeSolveHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget the loaded history (sign-out). */
export function clearSolveHistory(): void {
  loading = null;
  if (state) setState(null);
}

function uploadedFor(userId: string): boolean {
  try {
    const raw = localStorage.getItem(UPLOADED_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) && ids.includes(userId);
  } catch {
    return false;
  }
}

function markUploaded(userId: string): void {
  try {
    const raw = localStorage.getItem(UPLOADED_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    const next = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
    if (!next.includes(userId)) next.push(userId);
    localStorage.setItem(UPLOADED_KEY, JSON.stringify(next));
  } catch {
    // Without storage the upload simply repeats next time; the server merge makes that harmless.
  }
}

async function callRecordSolves(rows: SolveRow[]): Promise<SolveRow[]> {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  const { data, error } = await supabase.rpc("record_solves", { p_solves: rows });
  if (error) throw error;
  return (data ?? []).map(({ user_id: _owner, ...row }) => row);
}

async function fetchAllRows(userId: string): Promise<SolveRow[]> {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  const rows: SolveRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("solves").select(COLUMNS).eq("user_id", userId).order("completed_day").range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as SolveRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/**
 * Uploads this device's pre-account history to the account, once per account
 * per device. Returns the rows the server now holds for it, or null when
 * nothing was sent. A failed upload is not marked done, so it is retried the
 * next time the account appears; the server merge makes a repeat harmless.
 */
export async function uploadLocalHistory(userId: string, now: Date = new Date()): Promise<SolveRow[] | null> {
  if (uploadedFor(userId)) return null;
  const rows = legacyRowsFromStats(loadSoloStats(), dayKey(now), now.toISOString());
  if (rows.length === 0) {
    markUploaded(userId);
    return null;
  }
  const stored = await callRecordSolves(rows);
  markUploaded(userId);
  return stored;
}

/**
 * Loads the account's history (once per account per session) and then carries
 * over the device's local history. Safe to call repeatedly: a second call
 * while loading, or after success, is a no-op; after a failure it retries.
 */
export function ensureSolveHistory(userId: string): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (state?.userId === userId) {
    if (state.status === "ready") return Promise.resolve();
    if (state.status === "loading" && loading) return loading;
  }
  setRows(userId, null, "loading");
  const run = (async () => {
    let rows: SolveRow[];
    try {
      rows = await fetchAllRows(userId);
    } catch (err) {
      if (state?.userId === userId) setRows(userId, null, "error");
      console.warn("Solve history: could not load", err);
      return;
    }
    if (state?.userId !== userId) return;
    try {
      const uploaded = await uploadLocalHistory(userId);
      if (uploaded) rows = mergeRows(rows, uploaded);
    } catch (err) {
      console.warn("Solve history: could not upload this device's history", err);
    }
    if (state?.userId === userId) setRows(userId, rows, "ready");
  })();
  loading = run;
  return run.finally(() => {
    if (loading === run) loading = null;
  });
}

/**
 * Records a finish for a signed-in solver: judged against the loaded history,
 * merged into it at once (so every screen updates), then written through
 * record_solves. Returns null when there is no history to judge against (no
 * Supabase, or the load failed), in which case callers fall back to the
 * device's local stats. A failed write keeps the optimistic row; local stats
 * hold the finish too.
 */
export async function recordSolve(userId: string, input: SolveInput, now: Date = new Date()): Promise<SolveOutcome | null> {
  if (!supabase) return null;
  await ensureSolveHistory(userId);
  if (state?.userId !== userId || !state.rows) return null;
  const row = toSolveRow(input, now);
  const outcome = judgeSolve(state.rows, row);
  setRows(userId, mergeRows(state.rows, [row]), "ready");
  try {
    const stored = await callRecordSolves([row]);
    if (state?.userId === userId && state.rows) setRows(userId, mergeRows(state.rows, stored), "ready");
  } catch (err) {
    console.warn("Solve history: could not save a finish", err);
  }
  return outcome;
}

/** Test hook: forget everything, including the in-flight load. */
export function resetSolveHistoryForTests(): void {
  state = null;
  loading = null;
  listeners.clear();
}
