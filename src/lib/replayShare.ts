/**
 * Short share IDs for solve replays (migration 20261113000000_replay_shares.sql).
 * A replay code (replayCode.ts) is ~825 characters for a 15×15, too long for a
 * link that goes out as one message, so the finish files it once through
 * `create_replay_share` and the daily link carries the 11-character ID it
 * returns (derived from the code: the same solve always gets the same ID).
 * `/api/replay?s=<id>` looks the code up to draw the clip.
 */
import { supabase } from "./supabaseClient";
import { decodeReplay, REPLAY_KIND } from "./replayCode";
import { GHOST_COLORS, type Ghost, type TraceEvent } from "./race";

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

/** A shared replay's code by its ID (public), or null when there is none or it can't be read. */
export async function fetchReplayShare(id: string): Promise<string | null> {
  if (!supabase || !REPLAY_ID.test(id)) return null;
  try {
    const { data, error } = await supabase.from("replay_shares").select("code").eq("id", id).maybeSingle();
    return !error && data && typeof data.code === "string" ? data.code : null;
  } catch {
    return null;
  }
}

/**
 * The sender of a shared daily as a race ghost (race.ts): their solve's
 * squares filling and emptying on the racer's clock. Right and wrong letters
 * alike count as filled (a ghost never says which), refusals and clue changes
 * are left out. Null when the code doesn't decode or holds no fills.
 */
export function ghostFromReplay(code: string, shareId: string, name: string): Ghost | null {
  const replay = decodeReplay(code);
  if (!replay) return null;
  const events: TraceEvent[] = [];
  for (const e of replay.events) {
    if (e.kind === REPLAY_KIND.right || e.kind === REPLAY_KIND.wrong) events.push([e.ms, e.cell, 1]);
    else if (e.kind === REPLAY_KIND.emptied) events.push([e.ms, e.cell, 0]);
  }
  if (events.length === 0) return null;
  return { userId: `link:${shareId}`, name, color: GHOST_COLORS[0], seconds: replay.seconds, events };
}
