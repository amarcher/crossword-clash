import { supabase } from "./supabaseClient";
import { isLockedDay, type ArchiveWindow } from "./archive";
import type { DailyIndexEntry } from "./dailyIndex";
import type { DailySlot } from "./dailyFeed";

/**
 * Which of a set of people have finished which of a list of puzzles (migration
 * 20261203000000, the `group_solves` RPC): the caller, a room's host, players
 * and invited friends, and any accepted friends named. Never a time. The
 * caller filters the answer: "none of us", "they have and I have not", "we all
 * have". An anonymous player keeps finishes on the device and is never listed.
 */
export async function fetchGroupSolves(
  keys: readonly string[],
  who: { gameId?: string | null; friendIds?: readonly string[] } = {},
): Promise<Record<string, string[]>> {
  if (!supabase || keys.length === 0) return {};
  const { data, error } = await supabase.rpc("group_solves", {
    p_game_id: who.gameId ?? null,
    p_friend_ids: [...(who.friendIds ?? [])],
    p_puzzle_keys: [...keys],
  });
  if (error) throw new Error(error.message);
  const out: Record<string, string[]> = {};
  for (const row of (data ?? []) as { puzzle_key: string; user_id: string }[]) (out[row.puzzle_key] ??= []).push(row.user_id);
  return out;
}

/** How many past dailies of a size are asked about at once: about two months, newest first. */
export const FRESH_CANDIDATES = 60;

/**
 * The past dailies of one size this player could pick for a room: before
 * today (today's have their own cards), inside the player's archive window,
 * and not finished by the player. Newest first, at most FRESH_CANDIDATES.
 */
export function freshCandidates(
  entries: readonly DailyIndexEntry[],
  slot: DailySlot,
  today: string,
  window: ArchiveWindow,
  played: (key: string) => boolean,
): DailyIndexEntry[] {
  return entries
    .filter((e) => e.slot === slot && e.day < today && !isLockedDay(e.day, today, window) && !played(e.identity))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, FRESH_CANDIDATES);
}

/** The first `count` candidates nobody asked about has finished. */
export function freshForAll(candidates: readonly DailyIndexEntry[], solved: Record<string, string[]>, count: number): DailyIndexEntry[] {
  return candidates.filter((e) => !solved[e.identity]?.length).slice(0, count);
}
