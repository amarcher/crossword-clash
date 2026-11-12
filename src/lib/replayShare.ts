/**
 * Short share IDs for solve replays (migration 20261113000000_replay_shares.sql).
 * A replay code (replayCode.ts) is ~825 characters for a 15×15, too long for a
 * link that goes out as one message, so the finish files it once through
 * `create_replay_share` and the daily link carries the 11-character ID it
 * returns (derived from the code: the same solve always gets the same ID).
 * `/api/replay?s=<id>` looks the code up to draw the clip.
 */
import { supabase } from "./supabaseClient";

/** The shape of a replay share ID. */
export const REPLAY_ID = /^[A-Za-z0-9_-]{11}$/;

/** File a replay code; its share ID, or null when it can't be filed (offline, no session, the daily limit). */
export async function createReplayShare(code: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("create_replay_share", { p_code: code });
    return !error && typeof data === "string" && REPLAY_ID.test(data) ? data : null;
  } catch {
    return null;
  }
}
