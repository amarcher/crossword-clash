/**
 * Remote daily-puzzle feed.
 *
 * The bundled set in dailyMinis.ts is small and can only grow with a code
 * release. The feed lets a day's puzzle be published as a static file instead:
 * `public/daily-puzzles/YYYY-MM-DD.json` (added with `pnpm daily:add`), keyed by
 * the same local calendar day as the bundled rotation. A day with a feed file
 * uses it; any other day — or any failure to read the feed — falls back to the
 * bundled rotation, so the daily never depends on the network.
 *
 * The answer for a day is remembered in localStorage so repeat visits paint
 * instantly and `currentDailyMini()` (used by the leaderboard's "is this
 * today's daily?" check) stays synchronous.
 *
 * Website only for now: the native apps keep the bundled rotation until they
 * fetch from the site's origin (Vercel already serves it with CORS).
 */

import { dayKey } from "./soloStats";
import { getDailyMini, type DailyMini } from "./dailyMinis";
import { normalizeTransferPuzzle, type TransferPuzzle } from "./puzzleNormalizer";

export const DAILY_FEED_PATH = "/daily-puzzles";
const CACHE_KEY = "crossword-clash:daily-feed";
const FETCH_TIMEOUT_MS = 2500;
/** How long "no feed file for today" is trusted before the feed is asked again. */
export const ABSENT_TTL_MS = 3 * 60 * 60 * 1000;

const FEED_ENABLED = import.meta.env?.MODE !== "mobile";

/** The JSON shape of one feed file. */
export interface DailyFeedEntry {
  /** One-word theme shown beside the puzzle; optional for syndicated puzzles. */
  theme?: string;
  puzzle: TransferPuzzle;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

// --- Pure ---

export function dailyFeedUrl(day: string): string {
  return `${DAILY_FEED_PATH}/${day}.json`;
}

/** Validate one feed file's JSON. Null when it is not a playable puzzle. */
export function parseDailyFeedEntry(data: unknown): DailyMini | null {
  if (!data || typeof data !== "object") return null;
  const { theme, puzzle } = data as Partial<DailyFeedEntry>;
  if (theme !== undefined && typeof theme !== "string") return null;
  try {
    return { theme: theme ?? "", puzzle: normalizeTransferPuzzle(puzzle as TransferPuzzle) };
  } catch {
    return null;
  }
}

// --- Cache: what the feed said for one day ---

interface Known {
  day: string;
  /** null = the feed has no puzzle for this day. */
  mini: DailyMini | null;
  checkedAt: number;
}

let memo: Known | undefined;
let inflight: { day: string; promise: Promise<DailyMini> } | undefined;

function remember(day: string, data: unknown, checkedAt: number, persist: boolean): DailyMini | null {
  const mini = data === null ? null : parseDailyFeedEntry(data);
  memo = { day, mini, checkedAt };
  if (persist) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ day, entry: mini ? data : null, checkedAt }));
    } catch {
      // storage unavailable — the in-memory answer still holds for this page
    }
  }
  return mini;
}

function readStored(day: string): Known | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as { day?: unknown; entry?: unknown; checkedAt?: unknown };
    if (stored.day !== day || typeof stored.checkedAt !== "number") return undefined;
    if (stored.entry === null) return { day, mini: null, checkedAt: stored.checkedAt };
    const mini = parseDailyFeedEntry(stored.entry);
    return mini ? { day, mini, checkedAt: stored.checkedAt } : undefined;
  } catch {
    return undefined;
  }
}

/** The feed's answer for `now`'s day if we have one: a puzzle, null (none), or undefined (not asked). */
function known(now: Date): DailyMini | null | undefined {
  const day = dayKey(now);
  if (memo?.day !== day) memo = readStored(day);
  if (!memo) return undefined;
  if (memo.mini === null && now.getTime() - memo.checkedAt >= ABSENT_TTL_MS) return undefined;
  return memo.mini;
}

// --- Public ---

/**
 * Today's daily if it can be named without waiting: the feed's puzzle, or the
 * bundled one when the feed is known to have none. Null while the feed has not
 * answered yet — callers show a placeholder and use `resolveDailyMini`.
 */
export function knownDailyMini(now: Date = new Date()): DailyMini | null {
  if (!FEED_ENABLED) return getDailyMini(now);
  const mini = known(now);
  if (mini === undefined) return null;
  return mini ?? getDailyMini(now);
}

/** Best synchronous answer for today's daily: the feed's puzzle if known, else the bundled one. */
export function currentDailyMini(now: Date = new Date()): DailyMini {
  return (FEED_ENABLED ? known(now) : null) ?? getDailyMini(now);
}

/** Today's daily, asking the feed if it has not been asked recently. Never rejects. */
export function resolveDailyMini(
  now: Date = new Date(),
  fetchImpl: FetchLike | undefined = typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined,
): Promise<DailyMini> {
  const ready = knownDailyMini(now);
  if (ready || !fetchImpl) return Promise.resolve(ready ?? getDailyMini(now));

  const day = dayKey(now);
  if (inflight?.day === day) return inflight.promise;

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(dailyFeedUrl(day), { signal: controller.signal });
      if (res.ok) {
        // A host that falls back to index.html answers 200 with HTML; that is "no file".
        const data = await res.json().catch(() => null);
        return remember(day, data, now.getTime(), true) ?? getDailyMini(now);
      }
      // 404 is a real "nothing published"; anything else may be transient, so don't persist it.
      remember(day, null, now.getTime(), res.status === 404);
    } catch {
      remember(day, null, now.getTime(), false);
    } finally {
      clearTimeout(timer);
      inflight = undefined;
    }
    return getDailyMini(now);
  })();
  inflight = { day, promise };
  return promise;
}

/** Test hook: forget everything held in memory. */
export function resetDailyFeedMemory(): void {
  memo = undefined;
  inflight = undefined;
}
