/**
 * Whether the daily board shows only the viewer and their friends. Kept in
 * localStorage (`crossword-clash:board-friends-only`) and, for an account,
 * with the account (accountPrefs.ts).
 */
export const FRIENDS_ONLY_KEY = "crossword-clash:board-friends-only";

const listeners = new Set<() => void>();

export function readFriendsOnly(): boolean {
  try {
    return localStorage.getItem(FRIENDS_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFriendsOnly(on: boolean): void {
  try {
    if (on) localStorage.setItem(FRIENDS_ONLY_KEY, "1");
    else localStorage.removeItem(FRIENDS_ONLY_KEY);
  } catch {
    // A blocked store only costs the memory of the choice.
  }
  listeners.forEach((l) => l());
}

export function subscribeFriendsOnly(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
