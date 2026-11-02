/**
 * Challenge links for the dailies.
 *
 * A daily is identified by its day and slot, so its challenge link can be
 * short — `/daily/2026-10-20/mini?beat=102&by=Archer` — instead of carrying
 * the whole puzzle in a `#puzzle=` hash. The route loads that day's puzzle
 * from the feed (past days are served too) and lands on ChallengeScreen when
 * `beat` is present, or on the plain puzzle-ready screen without it.
 * Imported puzzles keep `buildChallengeUrl` (challenge.ts).
 *
 * Pure and unit-tested in dailyChallenge.test.ts.
 */

import { isDailySlot, type DailySlot } from "./dailyFeed";
import type { ChallengePayload } from "./challenge";

const BEAT_PARAM = "beat";
const BY_PARAM = "by";
const MAX_NAME_LENGTH = 40;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isDailyDay(day: unknown): day is string {
  return typeof day === "string" && DAY.test(day);
}

/** The route path for a day's daily, no origin. */
export function dailyPath(day: string, slot: DailySlot): string {
  return `/daily/${day}/${slot}`;
}

export interface DailyLinkInput {
  day: string;
  slot: DailySlot;
  /** The finisher's time, whole seconds — the ghost to beat. Omit to share the puzzle alone. */
  seconds?: number;
  /** The finisher's name; omitted when blank. */
  name?: string;
}

/** `https://crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer`. */
export function buildDailyLink(origin: string, input: DailyLinkInput): string {
  const base = origin.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (input.seconds !== undefined && Number.isFinite(input.seconds)) {
    params.set(BEAT_PARAM, String(Math.max(0, Math.floor(input.seconds))));
  }
  const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  if (name) params.set(BY_PARAM, name);
  const query = params.toString();
  return `${base}${dailyPath(input.day, input.slot)}${query ? `?${query}` : ""}`;
}

/** Validate the route params; null when the URL isn't a daily we could serve. */
export function parseDailyRoute(day: unknown, slot: unknown): { day: string; slot: DailySlot } | null {
  if (!isDailyDay(day) || !isDailySlot(slot)) return null;
  return { day, slot };
}

/**
 * The ghost from a daily link's query string: `beat` (whole seconds) and `by`
 * (the challenger's name; `fallbackName` when absent or blank). Null when
 * there is no `beat`, so a daily link without a time is a plain "play this".
 */
export function parseDailyChallenge(search: string, fallbackName: string): ChallengePayload | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const raw = params.get(BEAT_PARAM);
    if (raw == null) return null;
    const seconds = Number(raw);
    if (!Number.isInteger(seconds) || seconds < 0) return null;
    const name = (params.get(BY_PARAM) ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
    return { name: name || fallbackName, seconds };
  } catch {
    return null;
  }
}
