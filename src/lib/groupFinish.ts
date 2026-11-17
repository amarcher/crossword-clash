/**
 * The time of a puzzle finished in a room on a shared grid (Compete, Co-op).
 * Such a finish has no personal time, so the account's history keeps it with
 * `seconds: null` and it is not on the leaderboard; the room's own time is
 * remembered here, on the device that played, so the leaderboard can say
 * "Played as a group in 5:16" instead of offering the puzzle as untouched
 * (Andrew, 2026-11-16). Device-only: another device knows the puzzle was
 * played (the history row) but not how long the room took.
 */

const STORAGE_KEY = "crossword-clash-group-finishes";
/** Dailies turn over; the newest few are all anyone looks at. */
export const GROUP_FINISHES_KEPT = 60;

type Stored = Record<string, { seconds: number; at: number }>;

function read(): Stored {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

/** Remember the room's time for a puzzle (`puzzleIdentity`). The first finish of a puzzle stands. */
export function recordGroupFinish(puzzleKey: string, seconds: number, now: number = Date.now()): void {
  if (!puzzleKey || !Number.isFinite(seconds) || seconds <= 0) return;
  const stored = read();
  if (stored[puzzleKey]) return;
  stored[puzzleKey] = { seconds: Math.round(seconds), at: now };
  const kept = Object.entries(stored)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, GROUP_FINISHES_KEPT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // storage unavailable: the leaderboard still says the puzzle was played, without the time
  }
}

/** The room's time for a puzzle on this device, or null. */
export function groupFinishSeconds(puzzleKey: string | null | undefined): number | null {
  if (!puzzleKey) return null;
  const entry = read()[puzzleKey];
  return entry && typeof entry.seconds === "number" && entry.seconds > 0 ? entry.seconds : null;
}
