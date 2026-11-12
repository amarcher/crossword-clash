/**
 * Race replies (migration 20261113100000_race_replies.sql): when someone races
 * the sender of a shared daily and finishes, the sender hears how they did,
 * in the menu's inbox and as a push, and can watch their solve (/reply/:id).
 * The recipient files the reply at the finish; the server finds the sender
 * from the link's share, so either side may be an anonymous session.
 */
import { supabase } from "./supabaseClient";
import { isDailySlot, type DailySlot } from "./dailyFeed";

export interface RaceReply {
  id: string;
  /** The recipient's name as they finished. */
  name: string;
  day: string;
  slot: DailySlot;
  /** The recipient's time and the sender's, whole seconds. */
  seconds: number;
  toSeconds: number;
  /** The recipient's replay share (replayShare.ts), for watching their solve. */
  replyShareId: string | null;
  createdAt: string;
  seen: boolean;
}

type Row = { id: string; name: string; day: string; slot: string; seconds: number; to_seconds: number; reply_share_id: string | null; created_at: string; seen_at: string | null };

const COLUMNS = "id, name, day, slot, seconds, to_seconds, reply_share_id, created_at, seen_at";

function toReply(row: Row): RaceReply | null {
  if (!isDailySlot(row.slot)) return null;
  return {
    id: row.id,
    name: row.name,
    day: row.day,
    slot: row.slot,
    seconds: row.seconds,
    toSeconds: row.to_seconds,
    replyShareId: row.reply_share_id,
    createdAt: row.created_at,
    seen: !!row.seen_at,
  };
}

/** File the racer's reply to the link they raced. Best-effort: null when it can't be (offline, own link, limits). */
export async function replyToRace(input: { shareId: string; replyShareId: string | null; name: string; day: string; slot: DailySlot; seconds: number; toSeconds: number }): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("reply_to_race", {
      p_share_id: input.shareId,
      p_reply_share_id: input.replyShareId,
      p_name: input.name,
      p_day: input.day,
      p_slot: input.slot,
      p_seconds: Math.max(0, Math.floor(input.seconds)),
      p_to_seconds: Math.max(0, Math.floor(input.toSeconds)),
    });
    return error ? null : (data as string | null);
  } catch {
    return null;
  }
}

/** Replies to the viewer's shared links, newest first (RLS: only their own). */
export async function fetchRaceReplies(userId: string, limit = 10): Promise<RaceReply[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("race_replies").select(COLUMNS).eq("to_user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as Row[]).map(toReply).filter((r): r is RaceReply => r !== null);
}

/** One reply the viewer may read (theirs as sender or recipient), or null. */
export async function fetchRaceReply(id: string): Promise<RaceReply | null> {
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("race_replies").select(COLUMNS).eq("id", id).maybeSingle();
  return error || !data ? null : toReply(data as Row);
}

export async function markRepliesSeen(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return;
  await supabase.rpc("mark_race_replies_seen", { p_ids: ids });
}
