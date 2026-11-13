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
import { GHOST_COLORS, WRONG_LETTER, type Ghost, type TraceEvent } from "./race";
import type { PuzzleCell, PuzzleRef } from "../types/puzzle";

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

// --- This device's own replays, by puzzle ---

const REMEMBERED_KEY = "crossword-clash:replay-shares";
const MAX_REMEMBERED = 200;
type Remembered = Record<string, { id: string; seconds: number; at: number }>;

function readRemembered(): Remembered {
  try {
    const raw = localStorage.getItem(REMEMBERED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Remembered) : {};
  } catch {
    return {};
  }
}

/**
 * Keep a finish's replay share ID by puzzle (puzzleIdentity), so the solve
 * shares with its replay when it is reopened later, not only on the screen
 * right after the finish: the fastest finish's, for the newest 200 puzzles;
 * best-effort.
 */
export function rememberReplay(puzzleKey: string, id: string, seconds: number): void {
  if (!REPLAY_ID.test(id)) return;
  const all = readRemembered();
  // A reopened solve shows its best time, so a slower re-solve keeps the best one's replay.
  const best = all[puzzleKey];
  if (best && best.seconds < Math.floor(seconds)) return;
  all[puzzleKey] = { id, seconds: Math.floor(seconds), at: Date.now() };
  const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_REMEMBERED);
  try {
    localStorage.setItem(REMEMBERED_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or unavailable: a reopened solve just shares without its replay.
  }
}

/** The replay this device filed for a puzzle's finish in `seconds` (the time the share names), or null. */
export function rememberedReplay(puzzleKey: string, seconds: number): string | null {
  const entry = readRemembered()[puzzleKey];
  return entry && REPLAY_ID.test(entry.id) && entry.seconds === Math.floor(seconds) ? entry.id : null;
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
 * The sender of a shared link as a race ghost (race.ts): their solve's
 * squares filling and emptying on the racer's clock. Right and wrong letters
 * alike count as filled (a ghost never says which), refusals and clue changes
 * are left out. Null when the code doesn't decode or holds no fills.
 */
export function ghostFromReplay(code: string, shareId: string, name: string, ref?: PuzzleRef): Ghost | null {
  const replay = decodeReplay(code);
  if (!replay) return null;
  const events: TraceEvent[] = [];
  for (const e of replay.events) {
    if (e.kind === REPLAY_KIND.right || e.kind === REPLAY_KIND.wrong) events.push([e.ms, e.cell, 1]);
    else if (e.kind === REPLAY_KIND.emptied) events.push([e.ms, e.cell, 0]);
  }
  if (events.length === 0) return null;
  return { userId: `link:${shareId}`, name, color: GHOST_COLORS[0], seconds: replay.seconds, events, ...(ref ? { link: { shareId, ref } } : {}) };
}

/**
 * The sender's solve with its letters, for the replay after the racer
 * finishes: the code holds where and when each right letter went in, and a
 * right letter is the puzzle's answer there, so it is rebuilt from the grid;
 * a wrong one shows as WRONG_LETTER (which wrong letter isn't kept). Null when
 * the code doesn't decode or doesn't fit this puzzle.
 */
export function letteredReplay(
  code: string,
  puzzle: { width: number; height: number; cells: readonly (readonly Pick<PuzzleCell, "solution">[])[] },
): { seconds: number; events: TraceEvent[] } | null {
  const replay = decodeReplay(code);
  if (!replay || replay.width !== puzzle.width || replay.height !== puzzle.height) return null;
  const answer = (cell: number) => puzzle.cells[Math.floor(cell / puzzle.width)]?.[cell % puzzle.width]?.solution ?? null;
  const events: TraceEvent[] = [];
  for (const e of replay.events) {
    if (e.kind === REPLAY_KIND.right) {
      const letter = answer(e.cell);
      if (letter) events.push([e.ms, e.cell, letter]);
    } else if (e.kind === REPLAY_KIND.wrong) events.push([e.ms, e.cell, WRONG_LETTER]);
    else if (e.kind === REPLAY_KIND.emptied) events.push([e.ms, e.cell, ""]);
  }
  return events.length ? { seconds: replay.seconds, events } : null;
}
