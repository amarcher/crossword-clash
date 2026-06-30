/**
 * Solo play stakes: an elapsed timer, a personal-best time per puzzle, and a
 * daily-play streak.
 *
 * Everything that decides a value — formatting a clock, hashing a puzzle into a
 * stable identity, deciding whether a finish is a new record, and rolling a
 * streak across calendar days — is a PURE function here, unit-tested in
 * soloStats.test.ts. The only impure code is the thin localStorage wrapper at
 * the bottom (clearly fenced off), so the app degrades gracefully offline and
 * the math stays trivially testable.
 */

import type { Puzzle, PuzzleCell } from "../types/puzzle";

// --- Types ---

export interface StreakState {
  /** Current consecutive-day streak (0 when never played). */
  current: number;
  /** Longest streak ever reached. */
  longest: number;
  /** Local calendar day of the most recent counted play, "YYYY-MM-DD". */
  lastPlayedDay: string | null;
}

export interface SoloStats {
  version: 1;
  /** puzzleIdentity → best finish time in whole seconds. */
  bestTimes: Record<string, number>;
  streak: StreakState;
}

export interface SoloCompletionResult {
  /** The time the player just finished in, whole seconds. */
  finishSeconds: number;
  /** The best time on record for this puzzle after this finish. */
  bestSeconds: number;
  /** True when this finish set a new personal record. */
  isNewBest: boolean;
  /** Streak state after counting today's play. */
  streak: StreakState;
}

export const EMPTY_STREAK: StreakState = {
  current: 0,
  longest: 0,
  lastPlayedDay: null,
};

export const EMPTY_STATS: SoloStats = {
  version: 1,
  bestTimes: {},
  streak: { ...EMPTY_STREAK },
};

// --- Pure: time formatting ---

/**
 * Format a duration of whole seconds as a clock string.
 * Under an hour → "M:SS" (e.g. "4:32"); an hour or more → "H:MM:SS".
 * Negative or fractional input is clamped/floored to keep the clock honest.
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    const mm = String(minutes).padStart(2, "0");
    return `${hours}:${mm}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

// --- Pure: puzzle identity ---

/** djb2 string hash → unsigned base36. Deterministic across reloads. */
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // >>> 0 coerces to an unsigned 32-bit int so the key is stable & positive.
  return (hash >>> 0).toString(36);
}

function solutionSignature(cells: PuzzleCell[][]): string {
  let sig = "";
  for (const row of cells) {
    for (const cell of row) {
      sig += cell.solution ?? "#";
    }
    sig += "\n";
  }
  return sig;
}

/**
 * A stable identity for a puzzle: title + dimensions + solution grid, hashed.
 * Including the solution disambiguates two puzzles that happen to share a title
 * and size, so best times don't bleed between unrelated puzzles.
 */
export function puzzleIdentity(
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells">,
): string {
  const title = (puzzle.title || "untitled").trim().toLowerCase();
  const dims = `${puzzle.width}x${puzzle.height}`;
  return hashString(`${title}|${dims}|${solutionSignature(puzzle.cells)}`);
}

// --- Pure: best-time logic ---

/**
 * A finish is a new best when it is a positive time and either there is no
 * prior record or it beats the prior record.
 */
export function isNewBest(prevBest: number | null | undefined, durationSec: number): boolean {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return false;
  if (prevBest == null) return true;
  return durationSec < prevBest;
}

/**
 * Fold a finish into a best-times map. Returns the next map (a copy), the best
 * time now on record for the key, and whether the record was beaten.
 */
export function applyBestTime(
  bestTimes: Record<string, number>,
  key: string,
  durationSec: number,
): { bestTimes: Record<string, number>; best: number; isNewBest: boolean } {
  const prev = bestTimes[key];
  const beat = isNewBest(prev, durationSec);
  const best = beat ? durationSec : prev ?? durationSec;
  if (!beat) {
    return { bestTimes, best, isNewBest: false };
  }
  return { bestTimes: { ...bestTimes, [key]: best }, best, isNewBest: true };
}

// --- Pure: streak logic ---

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole-day difference between two "YYYY-MM-DD" keys (b - a). */
export function daysBetween(aKey: string, bKey: string): number {
  const a = Date.parse(`${aKey}T00:00:00Z`);
  const b = Date.parse(`${bKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Advance a streak for a play that happened on `todayKey`.
 * - Same day as the last play → unchanged (no double-count).
 * - Exactly one day after → increment.
 * - Any larger gap (or first play ever) → reset to 1.
 */
export function rollStreak(prev: StreakState, todayKey: string): StreakState {
  if (prev.lastPlayedDay === todayKey) {
    return prev;
  }
  let current: number;
  if (prev.lastPlayedDay == null) {
    current = 1;
  } else {
    const gap = daysBetween(prev.lastPlayedDay, todayKey);
    current = gap === 1 ? prev.current + 1 : 1;
  }
  return {
    current,
    longest: Math.max(prev.longest, current),
    lastPlayedDay: todayKey,
  };
}

/**
 * The streak to *display* for a given day. Stored `current` is only reset when
 * the player next plays, so a stale streak (last play more than a day ago) is
 * already broken even though the stored number lingers. Returns 0 in that case.
 */
export function effectiveStreak(streak: StreakState, todayKey: string): number {
  if (streak.lastPlayedDay == null) return 0;
  const gap = daysBetween(streak.lastPlayedDay, todayKey);
  if (Number.isNaN(gap)) return 0;
  return gap <= 1 ? streak.current : 0;
}

// --- Impure: localStorage persistence (degrades gracefully) ---

const STATS_KEY = "crossword-clash-solo-stats";
const TIMER_KEY = "crossword-clash-solo-timer";

export interface SoloTimerRecord {
  /** puzzleIdentity of the in-progress puzzle. */
  key: string;
  /** Elapsed milliseconds accumulated so far. */
  elapsedMs: number;
  /** Whether the puzzle has been finished (clock frozen). */
  completed: boolean;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable / quota — stats are best-effort, never fatal.
  }
}

export function loadSoloStats(): SoloStats {
  const raw = readJSON<Partial<SoloStats>>(STATS_KEY);
  if (!raw || typeof raw !== "object") return { version: 1, bestTimes: {}, streak: { ...EMPTY_STREAK } };
  return {
    version: 1,
    bestTimes: raw.bestTimes && typeof raw.bestTimes === "object" ? raw.bestTimes : {},
    streak: {
      current: typeof raw.streak?.current === "number" ? raw.streak.current : 0,
      longest: typeof raw.streak?.longest === "number" ? raw.streak.longest : 0,
      lastPlayedDay: typeof raw.streak?.lastPlayedDay === "string" ? raw.streak.lastPlayedDay : null,
    },
  };
}

export function saveSoloStats(stats: SoloStats): void {
  writeJSON(STATS_KEY, stats);
}

/** The streak that should be displayed right now (today). */
export function getDisplayStreak(now: Date = new Date()): number {
  return effectiveStreak(loadSoloStats().streak, dayKey(now));
}

/** The best time on record for a puzzle key, or null. */
export function getBestTime(key: string): number | null {
  const best = loadSoloStats().bestTimes[key];
  return typeof best === "number" ? best : null;
}

/**
 * Record a finished solo puzzle: update its best time and roll the daily
 * streak, persist, and return the result for display. Pure decisions are
 * delegated to applyBestTime / rollStreak; this only does I/O and clamping.
 */
export function recordSoloCompletion(
  key: string,
  durationSec: number,
  now: Date = new Date(),
): SoloCompletionResult {
  const finishSeconds = Math.max(0, Math.floor(durationSec));
  const stats = loadSoloStats();
  const { bestTimes, best, isNewBest: beat } = applyBestTime(
    stats.bestTimes,
    key,
    finishSeconds,
  );
  const streak = rollStreak(stats.streak, dayKey(now));
  saveSoloStats({ version: 1, bestTimes, streak });
  return { finishSeconds, bestSeconds: best, isNewBest: beat, streak };
}

/**
 * Build a completion result for an already-recorded (restored-on-reload) finish
 * without mutating stats — so refreshing a completed puzzle doesn't double-count
 * the streak or clobber the best time.
 */
export function describeRecordedCompletion(
  key: string,
  finishSeconds: number,
  now: Date = new Date(),
): SoloCompletionResult {
  const stats = loadSoloStats();
  const best = stats.bestTimes[key] ?? finishSeconds;
  return {
    finishSeconds,
    bestSeconds: best,
    isNewBest: false,
    streak: { ...stats.streak, current: effectiveStreak(stats.streak, dayKey(now)) },
  };
}

export function loadSoloTimer(): SoloTimerRecord | null {
  const raw = readJSON<SoloTimerRecord>(TIMER_KEY);
  if (!raw || typeof raw.key !== "string" || typeof raw.elapsedMs !== "number") return null;
  return { key: raw.key, elapsedMs: raw.elapsedMs, completed: !!raw.completed };
}

export function saveSoloTimer(record: SoloTimerRecord): void {
  writeJSON(TIMER_KEY, record);
}

export function clearSoloTimer(): void {
  try {
    localStorage.removeItem(TIMER_KEY);
  } catch {
    // ignore
  }
}
