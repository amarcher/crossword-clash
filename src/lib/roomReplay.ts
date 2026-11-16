/**
 * The replay of a shared-grid race (Andrew, 2026-11-14): after the finish the
 * room can watch the grid fill in again, each square in its claimant's
 * colour. Built from the cells as the device holds them: every claimed cell
 * carries `at`, stamped by this device when the claim arrived or, for cells
 * read back from the server, by `claim_cell` (migration
 * 20261124000000_claim_cell_at.sql). Device-only: nothing is uploaded and
 * there is no link.
 */
import type { CellState } from "../types/puzzle";
import { encodeRaceReplay, MAX_RACE_PLAYERS } from "./replayCode";

/** One claim: when (ms from the replay's start), where ("row,col"), what and who. */
export interface RoomReplayEvent {
  ms: number;
  key: string;
  letter: string;
  playerId: string;
}

export interface RoomReplay {
  /** In time order. */
  events: RoomReplayEvent[];
  /** The replay's length in ms (the last claim). */
  durationMs: number;
}

/** A replay shorter than this is not worth a button (a hydrated game whose times all coincide). */
const MIN_DURATION_MS = 1000;

/**
 * The room's replay, or null when the cells cannot tell it: a square with no
 * time (a game claimed before the server kept them, on a device that did not
 * watch it), a square with no claimant, or nothing claimed.
 *
 * `startedAt` is the race clock's start; the first claim is the zero when the
 * start is unknown or, across two clocks, later than that claim.
 */
export function buildRoomReplay(cells: Record<string, Pick<CellState, "letter" | "correct" | "playerId" | "at">>, startedAt?: number | null): RoomReplay | null {
  const claims: { at: number; key: string; letter: string; playerId: string }[] = [];
  for (const [key, c] of Object.entries(cells)) {
    if (!c.correct) continue;
    if (typeof c.at !== "number" || !Number.isFinite(c.at) || !c.playerId || !c.letter) return null;
    claims.push({ at: c.at, key, letter: c.letter, playerId: c.playerId });
  }
  if (claims.length === 0) return null;
  claims.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  const first = claims[0].at;
  const zero = typeof startedAt === "number" && startedAt <= first ? startedAt : first;
  const events = claims.map((c) => ({ ms: c.at - zero, key: c.key, letter: c.letter, playerId: c.playerId }));
  const durationMs = events[events.length - 1].ms;
  if (durationMs < MIN_DURATION_MS) return null;
  return { events, durationMs };
}

/** The grid `ms` into the replay, and how many squares each player holds by then. */
export function roomReplayAt(replay: RoomReplay, ms: number): { cells: Record<string, CellState>; counts: Record<string, number> } {
  const cells: Record<string, CellState> = {};
  const counts: Record<string, number> = {};
  for (const e of replay.events) {
    if (e.ms > ms) break;
    cells[e.key] = { letter: e.letter, correct: true, playerId: e.playerId };
    counts[e.playerId] = (counts[e.playerId] ?? 0) + 1;
  }
  return { cells, counts };
}

/**
 * The room's replay as a share code (encodeRaceReplay), for the clip a shared
 * link plays (Andrew, 2026-11-16: a finished race shared the emoji squares,
 * not the video). Players are ordered by squares held, most first, the
 * sharer first among equals, so the clip's bars read as the final standings.
 * Null when it cannot be told: more than eight claimants, or a claimant
 * without a #rrggbb colour.
 */
export function roomReplayCode(
  puzzle: { width: number; height: number; cells: readonly (readonly { solution: string | null }[])[] },
  replay: RoomReplay,
  colorMap: Readonly<Record<string, string>>,
  selfId?: string | null,
): string | null {
  const held = new Map<string, number>();
  for (const e of replay.events) held.set(e.playerId, (held.get(e.playerId) ?? 0) + 1);
  const order = [...held.keys()].sort((a, b) => held.get(b)! - held.get(a)! || Number(b === selfId) - Number(a === selfId) || a.localeCompare(b));
  if (order.length > MAX_RACE_PLAYERS || order.some((id) => !colorMap[id])) return null;
  const claims = replay.events.map((e) => {
    const [row, col] = e.key.split(",").map(Number);
    return { ms: e.ms, cell: row * puzzle.width + col, player: order.indexOf(e.playerId) };
  });
  return encodeRaceReplay(puzzle, claims, Math.ceil(replay.durationMs / 1000), order.map((id) => colorMap[id]));
}
