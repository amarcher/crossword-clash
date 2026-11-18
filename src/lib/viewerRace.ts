import { fetchOwnSolveTrace, loadTrace, squaresOnly } from "./race";
import { fetchFriendRace, raceSolves, type RaceSolve } from "./friendRace";

/**
 * The race as the viewer has it: their friends' recordings of the puzzle and
 * their own (the account's kept one, or this device's when the solve was
 * never filed, timed by `seconds`). Null when no friend has a recording.
 * `locked` is a Daily Plus seen without Plus: squares only, whatever came back.
 */
export async function loadViewerRace(userId: string, puzzleKey: string, seconds: number | undefined, youName: string, locked = false): Promise<{ solves: RaceSolve[]; letters: boolean; own: boolean } | null> {
  const kept = loadTrace(puzzleKey);
  const [found, mine] = await Promise.all([fetchFriendRace(puzzleKey), fetchOwnSolveTrace(userId, puzzleKey).catch(() => null)]);
  if (found.friends.length === 0) return null;
  const own = mine && mine.events.length > 0 ? mine : typeof seconds === "number" && kept && !kept.partial && kept.events.length > 0 ? { seconds, events: kept.events } : null;
  const solves = raceSolves(found, own ? { id: userId, name: youName, ...own } : null);
  if (locked) return { solves: solves.map((s) => ({ ...s, events: squaresOnly(s.events) })), letters: false, own: !!own };
  return { solves, letters: found.withLetters, own: !!own };
}
