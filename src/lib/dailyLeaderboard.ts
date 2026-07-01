/**
 * Cross-day daily-mini leaderboard.
 *
 * One row per (day, user) in the Supabase `daily_results` table: the player's
 * best finish time on that calendar day's daily mini, whether it came from a
 * solo solve or a live race. Everything that *decides* a value — the day key,
 * "is this puzzle today's daily?", and competition ranking — is a PURE function
 * here, unit-tested in dailyLeaderboard.test.ts. The Supabase I/O at the bottom
 * degrades to a no-op / empty board when the client isn't configured, so the
 * offline solo path is untouched.
 */

import { supabase } from "./supabaseClient";
import { dayKey, puzzleIdentity } from "./soloStats";
import { getDailyMini } from "./dailyMinis";
import type { Puzzle } from "../types/puzzle";

// --- Types ---

export type DailyMode = "solo" | "race";

export interface DailyResultEntry {
  userId: string;
  displayName: string;
  mode: DailyMode;
  /** Finish time, whole seconds. */
  seconds: number;
}

export interface RankedDailyEntry extends DailyResultEntry {
  /** 1-based placement using standard competition ranking ("1224"). */
  rank: number;
}

// --- Pure ---

/** The leaderboard day key for a given moment — local calendar day, matching
 *  the daily-mini rotation (dayNumber in dailyMinis.ts uses local Y/M/D). */
export function todayKey(now: Date = new Date()): string {
  return dayKey(now);
}

/**
 * Whether a loaded puzzle IS the daily mini for the given moment. Compared by
 * puzzle identity (title + dimensions + solution grid), so an imported copy of
 * an unrelated puzzle can never post to the daily board.
 */
export function isTodaysDaily(
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells"> | null,
  now: Date = new Date(),
): boolean {
  if (!puzzle) return false;
  return puzzleIdentity(puzzle) === puzzleIdentity(getDailyMini(now).puzzle);
}

/**
 * Sort by time ascending and assign standard competition ranks — ties share a
 * rank and the next distinct time skips past them (1, 2, 2, 4).
 */
export function rankEntries(entries: readonly DailyResultEntry[]): RankedDailyEntry[] {
  const sorted = [...entries].sort((a, b) => a.seconds - b.seconds);
  let lastSeconds: number | null = null;
  let lastRank = 0;
  return sorted.map((e, i) => {
    const rank = e.seconds === lastSeconds ? lastRank : i + 1;
    lastSeconds = e.seconds;
    lastRank = rank;
    return { ...e, rank };
  });
}

/**
 * A submission only replaces an existing result when it is strictly faster.
 */
export function shouldReplace(existingSeconds: number | null, newSeconds: number): boolean {
  if (!Number.isFinite(newSeconds) || newSeconds < 0) return false;
  return existingSeconds == null || newSeconds < existingSeconds;
}

// --- Impure: Supabase I/O (no-ops offline) ---

export interface SubmitDailyResultInput {
  day: string;
  userId: string;
  displayName: string;
  mode: DailyMode;
  seconds: number;
  gameId?: string | null;
}

/**
 * Record a daily finish, keeping only the player's best time for the day.
 * Best-effort: failures are logged and swallowed — a leaderboard hiccup must
 * never break the completion flow.
 */
export async function submitDailyResult(input: SubmitDailyResultInput): Promise<void> {
  if (!supabase) return;
  const seconds = Math.max(0, Math.floor(input.seconds));
  try {
    const { data: existing } = await supabase
      .from("daily_results")
      .select("id, seconds")
      .eq("day", input.day)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (!shouldReplace(existing?.seconds ?? null, seconds)) return;

    const row = {
      day: input.day,
      user_id: input.userId,
      display_name: input.displayName.trim().slice(0, 40) || "Player",
      mode: input.mode,
      seconds,
      game_id: input.gameId ?? null,
    };

    const { error } = await supabase
      .from("daily_results")
      .upsert(row, { onConflict: "day,user_id" });
    if (error) console.error("Failed to submit daily result:", error);
  } catch (err) {
    console.error("Failed to submit daily result:", err);
  }
}

/**
 * Today's board: entries ranked by time, capped at `limit` fastest.
 * Returns [] offline or on error.
 */
export async function fetchDailyLeaderboard(
  day: string,
  limit = 50,
): Promise<RankedDailyEntry[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("daily_results")
      .select("user_id, display_name, mode, seconds")
      .eq("day", day)
      .order("seconds", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return rankEntries(
      data.map((r) => ({
        userId: r.user_id,
        displayName: r.display_name,
        mode: (r.mode === "race" ? "race" : "solo") as DailyMode,
        seconds: r.seconds,
      })),
    );
  } catch {
    return [];
  }
}
