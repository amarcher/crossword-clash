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
import type { PuzzleRef } from "../types/puzzle";

const BEAT_PARAM = "beat";
const BY_PARAM = "by";
const REPLAY_PARAM = "r";
const RACE_PARAM = "race";
const WHO_PARAM = "who";
const MAX_RACE_NAMES = 8;

/** A race link's names, as written into and read out of `who`: trimmed, comma-free, at most 20 characters each. */
function raceNames(names: readonly string[]): string[] {
  return names.map((n) => n.replace(/[\s,]+/g, " ").trim().slice(0, 20)).filter(Boolean).slice(0, MAX_RACE_NAMES);
}
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
  /** The solve's replay share ID (replayShare.ts): the link's preview plays it (api/share.ts → og:video). */
  replay?: string;
  /** The link is to the race (friendRace.ts), not a solve to beat: how many solvers its clip holds. */
  race?: number;
  /** The race's solvers by name, in the clip's order (friendRace.raceShareOrder), so the link means the same to each of them. */
  who?: readonly string[];
}

/** `https://crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer`. */
export function buildDailyLink(origin: string, input: DailyLinkInput): string {
  return buildPuzzleLink(origin, { day: input.day, slot: input.slot }, input);
}

/** The page a shared puzzle lives at: its daily route, or its community page. */
export function puzzleRefPath(ref: PuzzleRef): string {
  return "shortId" in ref ? `/puzzles/${ref.shortId}` : dailyPath(ref.day, ref.slot);
}

/**
 * The challenge link to any shared puzzle (Puzzle.ref): a daily's, or a
 * community puzzle's `/puzzles/ab12cd34?beat=102&by=Archer&r=…`, which
 * CommunityPuzzleScreen turns into the same challenge.
 */
export function buildPuzzleLink(origin: string, ref: PuzzleRef, input: Pick<DailyLinkInput, "seconds" | "name" | "replay" | "race" | "who">): string {
  const base = origin.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (input.seconds !== undefined && Number.isFinite(input.seconds)) {
    params.set(BEAT_PARAM, String(Math.max(0, Math.floor(input.seconds))));
  }
  const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  if (name) params.set(BY_PARAM, name);
  const hasReplay = !!input.replay && /^[A-Za-z0-9_-]{11}$/.test(input.replay);
  if (hasReplay) params.set(REPLAY_PARAM, input.replay as string);
  // Only beside its clip: the count is what the link's preview says, the clip is what it opens.
  if (hasReplay && input.race !== undefined && Number.isInteger(input.race) && input.race >= 1 && input.race <= 8) params.set(RACE_PARAM, String(input.race));
  // Every solver named, or none: a preview that names half the race reads wrong.
  const who = input.who ? raceNames(input.who) : [];
  if (hasReplay && input.race !== undefined && who.length === input.race && who.length === input.who?.length) params.set(WHO_PARAM, who.join(","));
  const query = params.toString();
  return `${base}${puzzleRefPath(ref)}${query ? `?${query}` : ""}`;
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
    const replay = params.get(REPLAY_PARAM) ?? "";
    return { name: name || fallbackName, seconds, ...(/^[A-Za-z0-9_-]{11}$/.test(replay) ? { replay } : {}) };
  } catch {
    return null;
  }
}

/**
 * The clip a link carries without a time to beat (`?r=<share id>`): the race
 * someone shared (FriendRaceDialog), which the link opens on arrival
 * (SharedRace), and its solvers' names in the clip's order when the link has
 * them. Links sent before `race` was added carry the ID alone, so the ID is
 * enough. Null when there is none, or the link is a challenge.
 */
export function parseRaceLink(search: string): { id: string; names: string[] } | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    if (params.get(BEAT_PARAM) != null) return null;
    const replay = params.get(REPLAY_PARAM) ?? "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(replay)) return null;
    return { id: replay, names: raceNames((params.get(WHO_PARAM) ?? "").split(",")) };
  } catch {
    return null;
  }
}
