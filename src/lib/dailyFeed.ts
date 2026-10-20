/**
 * Remote daily-puzzle feed.
 *
 * Two daily slots share one feed: the **mini** (the original daily) and the
 * **large** (original 15×15 themed puzzles). A day's puzzle for a slot can be
 * published as a static file — `public/daily-puzzles/YYYY-MM-DD.json` for the
 * mini, `public/daily-puzzles/large/YYYY-MM-DD.json` for the large (both
 * written by `pnpm daily:add`) — or scheduled in Supabase, which api/daily.ts
 * serves at the same URLs. Everything is keyed by the same local calendar day
 * as the bundled rotation.
 *
 * The two slots differ in what "nothing published" means. The mini falls back
 * to the bundled set in dailyMinis.ts on any other day — or any failure to
 * read the feed — so it never depends on the network. The large has no
 * fallback: a day with nothing published simply has no large, and the menu
 * shows no tile for it.
 *
 * The answer for a day is remembered in localStorage per slot, so repeat
 * visits paint instantly and `currentDailyPuzzle()` (used by the
 * leaderboard's "is this today's daily?" check) stays synchronous.
 *
 * The native apps have no feed of their own, so they read the website's
 * (vercel.json allows any origin, including on a missing day's 404).
 */

import { dayKey } from "./soloStats";
import { getDailyMini, type DailyMini } from "./dailyMinis";
import { normalizeTransferPuzzle, type TransferPuzzle } from "./puzzleNormalizer";

/** The three dailies, smallest first. Mirrored (not imported) by api/daily.ts and the studio-schedule edge function. */
export const DAILY_SLOTS = ["mini", "midi", "large"] as const;
export type DailySlot = (typeof DAILY_SLOTS)[number];

export function isDailySlot(value: unknown): value is DailySlot {
  return (DAILY_SLOTS as readonly unknown[]).includes(value);
}

export const DAILY_FEED_PATH = "/daily-puzzles";
const CACHE_KEYS: Record<DailySlot, string> = {
  // The mini keeps its original key so a stored answer survives this change.
  mini: "crossword-clash:daily-feed",
  midi: "crossword-clash:daily-feed:midi",
  large: "crossword-clash:daily-feed:large",
};
const FETCH_TIMEOUT_MS = 2500;
/** How long "no feed file for today" is trusted before the feed is asked again. */
export const ABSENT_TTL_MS = 3 * 60 * 60 * 1000;

/** Where the feed lives: the page's own origin on the web, the public site in the apps. */
const FEED_ORIGIN = import.meta.env?.MODE === "mobile" ? "https://crosswordclash.com" : "";

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

/** The URL path of a slot's feed file for a day — also its path under public/. */
export function dailyFeedPath(slot: DailySlot, day: string): string {
  return slot === "mini" ? `${DAILY_FEED_PATH}/${day}.json` : `${DAILY_FEED_PATH}/${slot}/${day}.json`;
}

export function dailyFeedUrl(day: string, slot: DailySlot = "mini", origin: string = FEED_ORIGIN): string {
  return `${origin}${dailyFeedPath(slot, day)}`;
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

/** What a slot shows when the feed has nothing for the day: the bundled mini; no midi or large. */
function fallback(slot: DailySlot, now: Date): DailyMini | null {
  return slot === "mini" ? getDailyMini(now) : null;
}

// --- Cache: what the feed said for one day, per slot ---

interface Known {
  day: string;
  /** null = the feed has no puzzle for this day. */
  mini: DailyMini | null;
  checkedAt: number;
}

const memo: Partial<Record<DailySlot, Known>> = {};
const inflight: Partial<Record<DailySlot, { day: string; promise: Promise<DailyMini | null> }>> = {};

function remember(slot: DailySlot, day: string, data: unknown, checkedAt: number, persist: boolean): DailyMini | null {
  const mini = data === null ? null : parseDailyFeedEntry(data);
  memo[slot] = { day, mini, checkedAt };
  if (persist) {
    try {
      localStorage.setItem(CACHE_KEYS[slot], JSON.stringify({ day, entry: mini ? data : null, checkedAt }));
    } catch {
      // storage unavailable — the in-memory answer still holds for this page
    }
  }
  return mini;
}

function readStored(slot: DailySlot, day: string): Known | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEYS[slot]);
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
function known(slot: DailySlot, now: Date): DailyMini | null | undefined {
  const day = dayKey(now);
  if (memo[slot]?.day !== day) memo[slot] = readStored(slot, day);
  const k = memo[slot];
  if (!k) return undefined;
  if (k.mini === null && now.getTime() - k.checkedAt >= ABSENT_TTL_MS) return undefined;
  return k.mini;
}

// --- Public: any slot ---

/**
 * Today's puzzle in a slot if it can be named without waiting: the feed's
 * puzzle, or the slot's fallback when the feed is known to have none (the
 * bundled mini; no large). Undefined while the feed has not answered yet —
 * callers show a placeholder (or nothing) and use `resolveDailyPuzzle`.
 */
export function knownDailyPuzzle(slot: DailySlot, now: Date = new Date()): DailyMini | null | undefined {
  const k = known(slot, now);
  if (k === undefined) return undefined;
  return k ?? fallback(slot, now);
}

/** Best synchronous answer for a slot today: the feed's puzzle if known, else the slot's fallback. */
export function currentDailyPuzzle(slot: DailySlot, now: Date = new Date()): DailyMini | null {
  return known(slot, now) ?? fallback(slot, now);
}

/** Today's puzzle in a slot, asking the feed if it has not been asked recently. Never rejects. */
export function resolveDailyPuzzle(
  slot: DailySlot,
  now: Date = new Date(),
  fetchImpl: FetchLike | undefined = typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined,
): Promise<DailyMini | null> {
  const ready = knownDailyPuzzle(slot, now);
  if (ready !== undefined || !fetchImpl) return Promise.resolve(ready ?? fallback(slot, now));

  const day = dayKey(now);
  const pending = inflight[slot];
  if (pending?.day === day) return pending.promise;

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(dailyFeedUrl(day, slot), { signal: controller.signal });
      if (res.ok) {
        // A host that falls back to index.html answers 200 with HTML; that is "no file".
        const data = await res.json().catch(() => null);
        return remember(slot, day, data, now.getTime(), true) ?? fallback(slot, now);
      }
      // 404 is a real "nothing published"; anything else may be transient, so don't persist it.
      remember(slot, day, null, now.getTime(), res.status === 404);
    } catch {
      remember(slot, day, null, now.getTime(), false);
    } finally {
      clearTimeout(timer);
      inflight[slot] = undefined;
    }
    return fallback(slot, now);
  })();
  inflight[slot] = { day, promise };
  return promise;
}

/**
 * One day's puzzle in a slot by date — for the `/daily/:day/:slot` challenge
 * link, which may name a past day. Reads the feed directly (no cache: the
 * cache is today's answer); the mini falls back to the bundled rotation for
 * that day when the feed has nothing, the midi and large resolve null. A
 * host that answers a missing file with index.html (200 + HTML) is "nothing".
 * Never rejects.
 */
export async function fetchDailyForDay(
  day: string,
  slot: DailySlot,
  fetchImpl: FetchLike | undefined = typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined,
): Promise<DailyMini | null> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  const bundled = () => (date && slot === "mini" ? getDailyMini(date) : null);
  if (!date || !fetchImpl) return bundled();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS * 2);
  try {
    const res = await fetchImpl(dailyFeedUrl(day, slot), { signal: controller.signal });
    if (!res.ok) return bundled();
    const data = await res.json().catch(() => null);
    return parseDailyFeedEntry(data) ?? bundled();
  } catch {
    return bundled();
  } finally {
    clearTimeout(timer);
  }
}

// --- Public: the mini, which always has an answer ---

/** Today's mini if it can be named without waiting; null while the feed is being asked. */
export function knownDailyMini(now: Date = new Date()): DailyMini | null {
  return knownDailyPuzzle("mini", now) ?? null;
}

/** Best synchronous answer for today's mini: the feed's puzzle if known, else the bundled one. */
export function currentDailyMini(now: Date = new Date()): DailyMini {
  return known("mini", now) ?? getDailyMini(now);
}

/** Today's mini, asking the feed if it has not been asked recently. Never rejects. */
export function resolveDailyMini(now: Date = new Date(), fetchImpl?: FetchLike): Promise<DailyMini> {
  return resolveDailyPuzzle("mini", now, fetchImpl).then((mini) => mini ?? getDailyMini(now));
}

/** Test hook: forget everything held in memory. */
export function resetDailyFeedMemory(): void {
  for (const slot of DAILY_SLOTS) {
    memo[slot] = undefined;
    inflight[slot] = undefined;
  }
}
