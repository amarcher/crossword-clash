/**
 * The player's chosen display name, persisted once and reused everywhere a
 * name is needed (daily leaderboard, challenge links, hosting, joining).
 * Entering a name anywhere in the app should call savePlayerName so returning
 * players are never asked again.
 */

import { SUPPORTED_LANGS, tStatic } from "../i18n/i18n";

const NAME_KEY = "crossword-clash:name";

/** Matches the maxLength on the host/join name inputs. */
export const MAX_PLAYER_NAME_LENGTH = 20;

/**
 * Whether a name is a real, player-chosen one — non-empty and not the
 * anonymous default in ANY supported language (a Spanish player's row may
 * carry the English "Player" fallback the server stored, and vice versa).
 */
export function isRealPlayerName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  return SUPPORTED_LANGS.every(
    (lng) => trimmed !== tStatic("common.defaultPlayerName", { lng }),
  );
}

/** The persisted name, or null when none (or only a default) was ever saved. */
export function loadPlayerName(): string | null {
  try {
    const raw = localStorage.getItem(NAME_KEY);
    const trimmed = (raw ?? "").trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    return isRealPlayerName(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

/** Persist a player-chosen name; empty/default names are ignored, not saved. */
export function savePlayerName(name: string): void {
  try {
    const trimmed = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    if (!isRealPlayerName(trimmed)) return;
    localStorage.setItem(NAME_KEY, trimmed);
  } catch {
    // localStorage unavailable — the name just won't persist across sessions.
  }
}
