/**
 * What a shared result needs that is not the link itself: the site's address
 * and the viewer's standing in a race. Pure, unit-tested in resultCard.test.ts.
 */

/** The site's address, the base of every shared link. */
export const SHARE_URL = "https://crosswordclash.com";

export type ShareMode = "solo" | "multiplayer";

/** Minimal shape needed to rank a player — a scored entry from the scoreboard. */
export interface StandingPlayer {
  userId: string;
  cellsClaimed: number;
}

/** The viewing player's own placement, derived from the ranked scoreboard. */
export interface ViewerStanding {
  /** 1-based placement using standard competition ranking ("1224"). */
  rank: number;
  /** Total number of players in the game. */
  total: number;
  /** Sole leader — finished strictly ahead of everyone else. */
  won: boolean;
  /** Co-leader — shares the top score with at least one other player. */
  tiedForFirst: boolean;
}

/**
 * Compute the viewing player's standing from the SAME scored players the
 * scoreboard shows. Uses standard competition ranking, so a co-leader always
 * reads rank 1 (never 2). Returns `null` when the viewer isn't among the
 * players (e.g. a TV/host spectator) so callers fall back to the winner card.
 */
export function computeViewerStanding(
  players: readonly StandingPlayer[],
  currentUserId: string | undefined | null,
): ViewerStanding | null {
  if (!currentUserId) return null;
  const me = players.find((p) => p.userId === currentUserId);
  if (!me) return null;

  const higher = players.filter((p) => p.cellsClaimed > me.cellsClaimed).length;
  const sameTop = players.filter((p) => p.cellsClaimed === me.cellsClaimed).length;
  const rank = higher + 1;

  return {
    rank,
    total: players.length,
    won: rank === 1 && sameTop === 1,
    tiedForFirst: rank === 1 && sameTop > 1,
  };
}
