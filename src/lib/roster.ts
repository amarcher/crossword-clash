import type { Player } from "../types/game";
import { displayableName } from "./nameFilter";

/** The local player and the name they typed (the one source for their own row). */
export interface SelfName {
  userId: string;
  displayName: string;
}

/**
 * The roster the lobby and the scoreboard show while a game is in progress.
 *
 * Membership: Realtime presence once it has warmed (`presence` is null until
 * the first non-empty sync — an empty first sync only means our own track()
 * has not landed), the DB `players` rows before that.
 *
 * Order: the DB rows' order (host first, then join order) whichever source
 * answered, presence-only players after it in presence order. The server's
 * presence state is a map in no useful order, and the list used to be
 * rewritten from the DB on every hydrate and from presence on every sync,
 * so the rows (and the Host chip, which marks the first row) swapped places
 * each time one of them fired.
 *
 * Names: each player's presence payload (their own typed name), the DB row
 * while presence warms — and the local player's row always carries the name
 * they typed, whatever an older row of theirs said.
 */
export function liveRoster(presence: readonly Player[] | null, db: readonly Player[], self?: SelfName): Player[] {
  const order = new Map(db.map((p, i) => [p.userId, i]));
  const members =
    presence === null
      ? [...db]
      : [...presence].sort((a, b) => (order.get(a.userId) ?? Infinity) - (order.get(b.userId) ?? Infinity));
  const typed = self?.displayName.trim() ? displayableName(self.displayName) : null;
  return members.map((p) => (typed !== null && p.userId === self!.userId && p.displayName !== typed ? { ...p, displayName: typed } : p));
}
