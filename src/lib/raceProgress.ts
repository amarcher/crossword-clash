/**
 * Live progress in a time trial (race mode "async"): every player solves
 * their own copy and tells the room which squares they have filled, as
 * "row,col" keys and never letters. The others draw those squares with the
 * recorded-race dot (Cell.tsx ghostColor). Pure; tested in raceProgress.test.ts.
 */

/** userId → the squares that player has filled on their own copy. */
export type RaceProgress = Record<string, string[]>;

/** More keys than any grid has: a cap on what one message can make us hold. */
const MAX_KEYS = 2000;

/**
 * Take one player's announcement. Each carries their whole list, and nothing
 * is erased in a room, so a shorter (older, reordered) list never replaces a
 * longer one. Returns `prev` itself when nothing changes.
 */
export function mergeRaceProgress(prev: RaceProgress, playerId: unknown, cells: unknown, selfId: string): RaceProgress {
  if (typeof playerId !== "string" || playerId === selfId || !Array.isArray(cells)) return prev;
  const keys = cells.filter((k): k is string => typeof k === "string").slice(0, MAX_KEYS);
  if ((prev[playerId]?.length ?? 0) >= keys.length) return prev;
  return { ...prev, [playerId]: keys };
}

/** Cell key → the colour of the first other player (roster order) who has it filled. */
export function rivalTintMap(
  roster: readonly { userId: string; color: string }[],
  progress: RaceProgress,
  selfId: string | undefined,
): Map<string, string> {
  const tints = new Map<string, string>();
  for (const p of roster) {
    if (p.userId === selfId) continue;
    for (const key of progress[p.userId] ?? []) {
      if (!tints.has(key)) tints.set(key, p.color);
    }
  }
  return tints;
}

/** How much of the grid a player has filled, as a whole percent; null when unknown. Never 100 before a finish time says so. */
export function progressPercent(progress: RaceProgress, userId: string, totalCells: number): number | null {
  const filled = progress[userId]?.length ?? 0;
  if (!filled || totalCells <= 0) return null;
  return Math.min(99, Math.round((filled / totalCells) * 100));
}
