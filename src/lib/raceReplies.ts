/**
 * Race replies (migration 20261113100000_race_replies.sql): when someone races
 * the sender of a shared daily or community puzzle and finishes, the sender hears how they did,
 * in the menu's inbox and as a push, and can watch their solve (/reply/:id).
 * The recipient files the reply at the finish; the server finds the sender
 * from the link's share, so either side may be an anonymous session.
 */
import { supabase } from "./supabaseClient";
import { isDailySlot } from "./dailyFeed";
import type { PuzzleRef } from "../types/puzzle";

export interface RaceReply {
  id: string;
  /** The shared link that was raced (the sender's own replay share). */
  shareId: string;
  /** The recipient's name as they finished. */
  name: string;
  /** The puzzle raced: a day's daily, or a community puzzle (with its title). */
  ref: PuzzleRef;
  title: string | null;
  /** The recipient's time and the sender's, whole seconds. */
  seconds: number;
  toSeconds: number;
  /** The recipient's replay share (replayShare.ts), for watching their solve. */
  replyShareId: string | null;
  createdAt: string;
  seen: boolean;
}

type Row = { id: string; share_id: string; name: string; day: string | null; slot: string | null; short_id: string | null; title: string | null; seconds: number; to_seconds: number; reply_share_id: string | null; created_at: string; seen_at: string | null };

const COLUMNS = "id, share_id, name, day, slot, short_id, title, seconds, to_seconds, reply_share_id, created_at, seen_at";

function toReply(row: Row): RaceReply | null {
  const ref: PuzzleRef | null = row.short_id ? { shortId: row.short_id } : row.day && isDailySlot(row.slot) ? { day: row.day, slot: row.slot } : null;
  if (!ref) return null;
  return {
    id: row.id,
    shareId: row.share_id,
    name: row.name,
    ref,
    title: row.title,
    seconds: row.seconds,
    toSeconds: row.to_seconds,
    replyShareId: row.reply_share_id,
    createdAt: row.created_at,
    seen: !!row.seen_at,
  };
}

/** File the racer's reply to the link they raced. Best-effort: null when it can't be (offline, own link, limits). */
export async function replyToRace(input: { shareId: string; replyShareId: string | null; name: string; ref: PuzzleRef; seconds: number; toSeconds: number }): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("reply_to_race", {
      p_share_id: input.shareId,
      p_reply_share_id: input.replyShareId,
      p_name: input.name,
      p_day: "day" in input.ref ? input.ref.day : null,
      p_slot: "slot" in input.ref ? input.ref.slot : null,
      p_short_id: "shortId" in input.ref ? input.ref.shortId : null,
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
