/**
 * The race (Andrew, 2026-11-16): a puzzle's recorded solves by the viewer and
 * their friends, laid on one clock as if all had started together. Two
 * readings of it, both monotone so nothing flickers while it plays: how much
 * of the grid each solver had settled at a moment, and who settled each
 * square first.
 *
 * A square is settled when it takes the value it ends the solve with: a
 * wrong letter typed over later settles at the later moment. A recording
 * without letters (the viewer has not solved the puzzle) only knows filled
 * or empty, so there a square settles when it was last filled from empty.
 */
import { supabase } from "./supabaseClient";
import { encodeRaceReplay, MAX_RACE_PLAYERS } from "./replayCode";
import { cleanEvents, type TraceEvent } from "./race";

/** One solver in the race. */
export interface RaceSolve {
  id: string;
  name: string;
  color: string;
  seconds: number;
  events: TraceEvent[];
}

/** The viewer's colour in the race. */
export const RACE_SELF_COLOR = "#3a6bf0";
/**
 * Friends' colours, in turn: the players' palette without its blue (the
 * viewer's), then four more, so all eleven friends the server returns are
 * told apart.
 */
export const RACE_FRIEND_COLORS = ["#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#0d9488", "#65a30d", "#92400e", "#475569"] as const;
/** Solvers showing when the race opens, and the most a shared clip holds (replayCode's MAX_RACE_PLAYERS). */
export const RACE_SHOWN_AT_FIRST = 8;

/** The race's solvers: the viewer's own solve first when there is one, then friends as the server ordered them. */
export function raceSolves(race: FriendRace, own: { id: string; name: string; seconds: number; events: TraceEvent[] } | null): RaceSolve[] {
  return [
    ...(own && own.events.length > 0 ? [{ ...own, color: RACE_SELF_COLOR }] : []),
    ...race.friends.map((f, i) => ({ id: f.userId, name: f.username, color: RACE_FRIEND_COLORS[i % RACE_FRIEND_COLORS.length], seconds: f.seconds, events: f.events })),
  ];
}

/** Friends the server returns, fastest first (the viewer makes twelve). */
export const MAX_RACE_FRIENDS = 11;

/** Cell index → the ms at which the square took its final value. */
export function settledAt(events: readonly TraceEvent[]): Map<number, number> {
  const value = new Map<number, string | number>();
  const at = new Map<number, number>();
  for (const [ms, cell, letter] of events) {
    if (letter === "" || letter === 0) {
      value.delete(cell);
      at.delete(cell);
    } else if (value.get(cell) !== letter) {
      value.set(cell, letter);
      at.set(cell, ms);
    }
  }
  return at;
}

/** A solve read for playback: its settle times, sorted, and by square. */
export interface RaceLane {
  solve: RaceSolve;
  bySquare: Map<number, number>;
  times: number[];
}

export function raceLane(solve: RaceSolve): RaceLane {
  const bySquare = settledAt(solve.events);
  return { solve, bySquare, times: [...bySquare.values()].sort((a, b) => a - b) };
}

/** The share of `total` squares a solver had settled `ms` in: 1 once their clock has stopped. */
export function progressAt(lane: RaceLane, ms: number, total: number): number {
  if (ms >= lane.solve.seconds * 1000) return 1;
  let n = 0;
  while (n < lane.times.length && lane.times[n] <= ms) n++;
  return total > 0 ? Math.min(1, n / total) : 0;
}

/** Cell index → who settled it first (a lane index) and when. Ties go to the earlier lane. */
export function firstToSquare(lanes: readonly RaceLane[]): Map<number, { lane: number; ms: number }> {
  const out = new Map<number, { lane: number; ms: number }>();
  lanes.forEach((lane, i) => {
    for (const [cell, ms] of lane.bySquare) {
      const held = out.get(cell);
      if (!held || ms < held.ms) out.set(cell, { lane: i, ms });
    }
  });
  return out;
}

/** How many squares each lane had been first to, `ms` in. */
export function squaresFirst(first: ReadonlyMap<number, { lane: number; ms: number }>, laneCount: number, ms: number): number[] {
  const counts = new Array<number>(laneCount).fill(0);
  for (const { lane, ms: at } of first.values()) if (at <= ms) counts[lane]++;
  return counts;
}

/** The lanes in running order `ms` in: finishers by time, then by how much is settled. */
export function runningOrder(lanes: readonly RaceLane[], ms: number, total: number): number[] {
  const done = (l: RaceLane) => ms >= l.solve.seconds * 1000;
  return lanes
    .map((_, i) => i)
    .sort((a, b) => {
      const [la, lb] = [lanes[a], lanes[b]];
      if (done(la) !== done(lb)) return done(la) ? -1 : 1;
      if (done(la)) return la.solve.seconds - lb.solve.seconds || a - b;
      return progressAt(lb, ms, total) - progressAt(la, ms, total) || a - b;
    });
}

/**
 * The race as a share code (encodeRaceReplay): the clip a shared link plays,
 * the grid filling in the colour of whoever settled each square first, with a
 * bar per solver counting their squares. Solvers are ordered by squares won,
 * so the bars read as the final standings. Colours only: no names and no
 * letters leave with it. Null when it cannot be told (more than eight
 * solvers, nothing settled).
 */
export function raceShareCode(puzzle: { width: number; height: number; cells: readonly (readonly { solution: string | null }[])[] }, lanes: readonly RaceLane[]): string | null {
  if (lanes.length === 0 || lanes.length > MAX_RACE_PLAYERS) return null;
  const first = firstToSquare(lanes);
  const won = squaresFirst(first, lanes.length, Infinity);
  const order = lanes.map((_, i) => i).sort((a, b) => won[b] - won[a] || a - b);
  const claims = [...first].map(([cell, { lane, ms }]) => ({ ms, cell, player: order.indexOf(lane) }));
  if (claims.length === 0) return null;
  const lastMs = Math.max(...claims.map((c) => c.ms));
  return encodeRaceReplay(puzzle, claims, Math.ceil(lastMs / 1000), order.map((i) => lanes[i].solve.color));
}

export interface FriendRace {
  friends: { userId: string; username: string; seconds: number; events: TraceEvent[] }[];
  /** The viewer has finished the puzzle, so the recordings carry their letters. */
  withLetters: boolean;
}

/** The viewer's friends' recordings of a puzzle, fastest first. Free; friends only. */
export async function fetchFriendRace(puzzleKey: string): Promise<FriendRace> {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  const { data, error } = await supabase.rpc("friend_race", { p_puzzle_key: puzzleKey });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { user_id: string; username: string; seconds: number; events: unknown; with_letters: boolean }[];
  return {
    friends: rows
      .map((r) => ({ userId: r.user_id, username: r.username, seconds: r.seconds, events: cleanEvents(r.events) }))
      .filter((r) => r.events.length > 0),
    withLetters: rows.some((r) => r.with_letters),
  };
}
