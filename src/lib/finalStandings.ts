/**
 * The frozen record of a finished multiplayer game — who played, what each
 * claimed, who won — taken once at the finish and never touched by presence
 * again. Pure; tested in finalStandings.test.ts.
 *
 * Why a snapshot: the live roster is Realtime presence, so a partner who
 * leaves the room (or whose phone locks) after the finish simply disappears,
 * and the completion screen used to lose their row, their colour on the grid
 * and their squares in the share block. The record is built from the claimed
 * cells (each carries its claimant) plus every player known at that moment —
 * presence AND the DB rows — so a player who has already dropped is listed.
 */

import type { CellState } from "../types/puzzle";
import type { Player, RaceMode } from "../types/game";

export interface FinalStanding {
  userId: string;
  displayName: string;
  /** The colour the player had during the game (the share squares follow it). */
  color: string;
  /** Correct squares this player claimed on the shared grid. */
  cellsClaimed: number;
  /** Async race: this player's own finish time in whole seconds, else null. */
  raceSeconds: number | null;
}

export interface FinalStandings {
  mode: RaceMode;
  /** Every player of the game, in join order (the DB order; presence-only extras after). */
  players: FinalStanding[];
  /**
   * The winner(s): most squares in versus, fastest in async, two or more when
   * tied; empty for a co-op finish (a team has no winner).
   */
  winnerIds: string[];
}

type RosterPlayer = Pick<Player, "userId" | "displayName" | "color">;

/**
 * The union of the presence roster and the DB rows, keyed by user id: the DB
 * order (join order, which is the colour order) with presence-only players
 * appended; presence wins the name and colour when both know a player.
 */
export function mergeRosters(presence: readonly RosterPlayer[], db: readonly RosterPlayer[]): RosterPlayer[] {
  const byId = new Map<string, RosterPlayer>();
  for (const p of db) byId.set(p.userId, { userId: p.userId, displayName: p.displayName, color: p.color });
  for (const p of presence) byId.set(p.userId, { userId: p.userId, displayName: p.displayName, color: p.color });
  return [...byId.values()];
}

/** Correct squares per claimant. */
export function cellsClaimedBy(cells: Record<string, Pick<CellState, "correct" | "playerId">>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of Object.values(cells)) {
    if (c.correct && c.playerId) counts.set(c.playerId, (counts.get(c.playerId) ?? 0) + 1);
  }
  return counts;
}

/** Build the record from the roster at the finish, the claimed cells and (async) the finish times. */
export function buildFinalStandings(
  roster: readonly RosterPlayer[],
  cells: Record<string, Pick<CellState, "correct" | "playerId">>,
  finishTimes: Readonly<Record<string, number>>,
  mode: RaceMode,
): FinalStandings {
  const claimed = cellsClaimedBy(cells);
  const players: FinalStanding[] = roster.map((p) => ({
    userId: p.userId,
    displayName: p.displayName,
    color: p.color,
    cellsClaimed: claimed.get(p.userId) ?? 0,
    raceSeconds: typeof finishTimes[p.userId] === "number" ? finishTimes[p.userId] : null,
  }));

  let winnerIds: string[] = [];
  if (mode === "versus") {
    const top = Math.max(0, ...players.map((p) => p.cellsClaimed));
    winnerIds = top > 0 ? players.filter((p) => p.cellsClaimed === top).map((p) => p.userId) : [];
  } else if (mode === "async") {
    const finished = players.filter((p) => p.raceSeconds !== null);
    const best = Math.min(...finished.map((p) => p.raceSeconds as number));
    winnerIds = finished.filter((p) => p.raceSeconds === best).map((p) => p.userId);
  }
  return { mode, players, winnerIds };
}

/** userId → colour, as the share block and the grid want it. */
export function colorMapOf(standings: Pick<FinalStandings, "players">): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of standings.players) map[p.userId] = p.color;
  return map;
}
