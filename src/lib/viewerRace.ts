import { fetchOwnSolveTrace, loadTrace } from "./race";
import { fetchFriendRace, raceSolves, type RaceSolve } from "./friendRace";

/**
 * The race as the viewer has it: their friends' recordings of the puzzle and
 * their own (the account's kept one, or this device's when the solve was
 * never filed, timed by `seconds`). Null when no friend has a recording.
 */
export async function loadViewerRace(userId: string, puzzleKey: string, seconds: number | undefined, youName: string): Promise<{ solves: RaceSolve[]; letters: boolean; own: boolean } | null> {
  const kept = loadTrace(puzzleKey);
  const [found, mine] = await Promise.all([fetchFriendRace(puzzleKey), fetchOwnSolveTrace(userId, puzzleKey).catch(() => null)]);
  if (found.friends.length === 0) return null;
  const own = mine && mine.events.length > 0 ? mine : typeof seconds === "number" && kept && !kept.partial && kept.events.length > 0 ? { seconds, events: kept.events } : null;
  return { solves: raceSolves(found, own ? { id: userId, name: youName, ...own } : null), letters: found.withLetters, own: !!own };
}
