/**
 * Async ("time trial") race standings — pure, unit-tested in raceResults.test.ts.
 * Every player solves their own copy; standings rank finishers by time
 * (standard competition ranking, ties share a rank) with still-solving players
 * listed after all finishers, in roster order.
 */

import type { Player } from "../types/game";

export interface RaceStandingRow {
  userId: string;
  displayName: string;
  color: string;
  /** Finish time in whole seconds, or null while still solving. */
  seconds: number | null;
  /** 1-based competition rank among finishers, or null while still solving. */
  rank: number | null;
}

export function rankRaceStandings(
  players: readonly Pick<Player, "userId" | "displayName" | "color">[],
  finishTimes: Readonly<Record<string, number>>,
): RaceStandingRow[] {
  const finished = players
    .filter((p) => finishTimes[p.userId] !== undefined)
    .sort((a, b) => finishTimes[a.userId] - finishTimes[b.userId]);
  const solving = players.filter((p) => finishTimes[p.userId] === undefined);

  let lastSeconds: number | null = null;
  let lastRank = 0;
  const rows: RaceStandingRow[] = finished.map((p, i) => {
    const seconds = finishTimes[p.userId];
    const rank = seconds === lastSeconds ? lastRank : i + 1;
    lastSeconds = seconds;
    lastRank = rank;
    return { userId: p.userId, displayName: p.displayName, color: p.color, seconds, rank };
  });

  for (const p of solving) {
    rows.push({ userId: p.userId, displayName: p.displayName, color: p.color, seconds: null, rank: null });
  }
  return rows;
}

/** All players have a recorded finish time. */
export function allFinished(
  players: readonly Pick<Player, "userId">[],
  finishTimes: Readonly<Record<string, number>>,
): boolean {
  return players.length > 0 && players.every((p) => finishTimes[p.userId] !== undefined);
}
