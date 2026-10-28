/**
 * Cross-day daily leaderboards — one per daily slot (mini, large).
 *
 * One row per (day, slot, user) in the Supabase `daily_results` table: the
 * player's best finish time on that calendar day's daily in that slot, whether
 * it came from a solo solve or a live race. Everything that *decides* a value — the day key,
 * "is this puzzle today's daily?", and competition ranking — is a PURE function
 * here, unit-tested in dailyLeaderboard.test.ts. The Supabase I/O at the bottom
 * degrades to a no-op / empty board when the client isn't configured, so the
 * offline solo path is untouched.
 */

import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabaseClient";
import { dayKey, puzzleIdentity } from "./soloStats";
import { DAILY_SLOTS, currentDailyPuzzle, type DailySlot } from "./dailyFeed";
import type { Puzzle } from "../types/puzzle";
import { displayableName } from "./nameFilter";
import { isRealPlayerName } from "./playerName";

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

/**
 * A daily finish the viewer just made, held in GameContext while (and after)
 * it is posted, so the board can wait for the round trip instead of racing
 * it, and can show the viewer's own row before the server answers.
 *
 * A finish made under the anonymous default name is parked here *unposted*
 * (`posted: false`): the row exists on this device only until the finisher
 * signs it (`signDailyResult`), so the public board never fills with
 * "Player" rows.
 */
export interface PendingDailyResult {
  day: string;
  slot: DailySlot;
  entry: DailyResultEntry;
  /** The room the finish came from (a race); null for a solo finish. */
  gameId: string | null;
  /** Whether the finish was sent to the board (or is on its way). */
  posted: boolean;
  /** Resolves once the submission has finished (it never rejects). */
  settled: Promise<void>;
}

// --- Pure ---

/** The leaderboard day key for a given moment — local calendar day, matching
 *  the daily-mini rotation (dayNumber in dailyMinis.ts uses local Y/M/D). */
export function todayKey(now: Date = new Date()): string {
  return dayKey(now);
}

/**
 * Which daily a loaded puzzle IS for the given moment — "mini", "midi", "large", or
 * null for neither. Compared by puzzle identity (title + dimensions +
 * solution grid), so an imported copy of an unrelated puzzle can never post
 * to a daily board. A slot whose feed hasn't answered yet can't match; the
 * hooks re-check once it has.
 */
export function todaysDailySlot(
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells"> | null,
  now: Date = new Date(),
): DailySlot | null {
  if (!puzzle) return null;
  const identity = puzzleIdentity(puzzle);
  for (const slot of DAILY_SLOTS) {
    const daily = currentDailyPuzzle(slot, now);
    if (daily && puzzleIdentity(daily.puzzle) === identity) return slot;
  }
  return null;
}

/** Whether a loaded puzzle is one of today's dailies. */
export function isTodaysDaily(
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells"> | null,
  now: Date = new Date(),
): boolean {
  return todaysDailySlot(puzzle, now) !== null;
}

/** The leaderboard route for a slot; the mini keeps its original URL. */
export function leaderboardPath(slot: DailySlot): string {
  return slot === "mini" ? "/daily/leaderboard" : `/daily/leaderboard/${slot}`;
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
 * The board with the viewer's own finish folded in: a fetched row for the
 * same user keeps its name but never a slower time than the finish just
 * made; a missing row (replication lag, a failed post) is added. Re-ranked.
 */
export function mergeOwnResult(
  entries: readonly RankedDailyEntry[],
  own: DailyResultEntry | null | undefined,
): RankedDailyEntry[] {
  if (!own) return [...entries];
  const plain: DailyResultEntry[] = entries.map(({ rank: _rank, ...e }) => e);
  const mine = plain.find((e) => e.userId === own.userId);
  if (mine) {
    if (own.seconds < mine.seconds) {
      mine.seconds = own.seconds;
      mine.mode = own.mode;
    }
  } else {
    plain.push({ ...own });
  }
  return rankEntries(plain);
}

/**
 * The origins whose finishes go on the public board. Vercel preview
 * deployments and local dev share the production Supabase project, so a
 * test solve on either would otherwise land on the live leaderboard (one
 * did, on 2026-10-27). The native apps serve from a local WebView origin
 * and always post.
 */
export const BOARD_ORIGINS: readonly string[] = ["https://crosswordclash.com", "https://www.crosswordclash.com"];

/** Whether a page served from `origin` (or a native app) posts to the board. */
export function boardPostsFrom(origin: string, native: boolean): boolean {
  return native || BOARD_ORIGINS.includes(origin);
}

/** Whether this page posts to the board — production and the apps only. */
export function boardPostsHere(): boolean {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return boardPostsFrom(origin, Capacitor.isNativePlatform());
}

/** Whether a pending finish belongs to the board being shown. */
export function pendingResultFor(
  pending: PendingDailyResult | null | undefined,
  day: string,
  slot: DailySlot,
): PendingDailyResult | null {
  return pending && pending.day === day && pending.slot === slot ? pending : null;
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
  /** Which daily board; defaults to the mini. */
  slot?: DailySlot;
  userId: string;
  displayName: string;
  mode: DailyMode;
  seconds: number;
  gameId?: string | null;
}

/**
 * Record a daily finish, keeping only the player's best time for the day.
 * Best-effort: failures are logged and swallowed — a leaderboard hiccup must
 * never break the completion flow. A no-op off the production origin
 * (`boardPostsHere`), so previews and dev never write to the live board.
 */
export async function submitDailyResult(input: SubmitDailyResultInput): Promise<void> {
  if (!supabase || !boardPostsHere()) return;
  const seconds = Math.max(0, Math.floor(input.seconds));
  const slot = input.slot ?? "mini";
  try {
    const { data: existing } = await supabase
      .from("daily_results")
      .select("id, seconds")
      .eq("day", input.day)
      .eq("slot", slot)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (!shouldReplace(existing?.seconds ?? null, seconds)) return;

    const row = {
      day: input.day,
      slot,
      user_id: input.userId,
      display_name: displayableName(input.displayName).slice(0, 40),
      mode: input.mode,
      seconds,
      game_id: input.gameId ?? null,
    };

    const { error } = await supabase
      .from("daily_results")
      .upsert(row, { onConflict: "day,slot,user_id" });
    if (error) console.error("Failed to submit daily result:", error);
  } catch (err) {
    console.error("Failed to submit daily result:", err);
  }
}

/**
 * Rename the player's existing entry for a day — used when a finisher signs
 * the board after their time was already submitted under the anonymous
 * default. A plain UPDATE (not upsert) because submitDailyResult's keep-best
 * rule would refuse to touch a row without a strictly faster time.
 * Best-effort like submitDailyResult.
 */
export async function updateDailyDisplayName(
  day: string,
  userId: string,
  displayName: string,
  slot: DailySlot = "mini",
): Promise<void> {
  if (!supabase || !boardPostsHere()) return;
  if (!displayName.trim()) return;
  const name = displayableName(displayName).slice(0, 40);
  try {
    const { error } = await supabase
      .from("daily_results")
      .update({ display_name: name })
      .eq("day", day)
      .eq("slot", slot)
      .eq("user_id", userId);
    if (error) console.error("Failed to update daily display name:", error);
  } catch (err) {
    console.error("Failed to update daily display name:", err);
  }
}

/**
 * Park a finish for the board and post it when it carries a real name. The
 * anonymous default ("Player" in any language) is never posted: the finish
 * stays on this device, the completion modal and the board offer the sign
 * form, and `signDailyResult` posts it the moment a name lands. A signed-in
 * account's username is already a real name, so it posts at once.
 */
export function postDailyResult(
  day: string,
  slot: DailySlot,
  entry: DailyResultEntry,
  gameId: string | null = null,
): PendingDailyResult {
  if (!isRealPlayerName(entry.displayName)) {
    return { day, slot, entry, gameId, posted: false, settled: Promise.resolve() };
  }
  return { day, slot, entry, gameId, posted: true, settled: submitDailyResult({ day, slot, gameId, ...entry }) };
}

/**
 * Sign a parked finish: an unposted one is posted now under the name (the
 * board awaits the new `settled`); a posted one is renamed in place through
 * `updateDailyDisplayName`. Returns the replacement for GameContext.
 */
export function signDailyResult(pending: PendingDailyResult, name: string): PendingDailyResult {
  const displayName = name.trim();
  if (!displayName) return pending;
  const entry = { ...pending.entry, displayName };
  if (pending.posted) {
    void updateDailyDisplayName(pending.day, pending.entry.userId, displayName, pending.slot);
    return { ...pending, entry };
  }
  const settled = submitDailyResult({ day: pending.day, slot: pending.slot, gameId: pending.gameId, ...entry });
  return { ...pending, entry, posted: true, settled };
}

/**
 * Today's board for a slot: entries ranked by time, capped at `limit` fastest.
 * Returns [] offline or on error.
 */
export async function fetchDailyLeaderboard(
  day: string,
  slot: DailySlot = "mini",
  limit = 50,
): Promise<RankedDailyEntry[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("daily_results")
      .select("user_id, display_name, mode, seconds")
      .eq("day", day)
      .eq("slot", slot)
      .order("seconds", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return rankEntries(
      data.map((r) => ({
        userId: r.user_id,
        displayName: displayableName(r.display_name),
        mode: (r.mode === "race" ? "race" : "solo") as DailyMode,
        seconds: r.seconds,
      })),
    );
  } catch {
    return [];
  }
}
