/**
 * Async "challenge a friend" ghost race.
 *
 * A finisher turns their solve into a self-contained challenge link: the exact
 * puzzle rides in the reused `#puzzle=` hash (see puzzleUrl.ts — no new puzzle
 * encoding invented), while the challenger's name + finish time travel in the
 * query string. The friend opens the link, solves the SAME puzzle solo, and
 * races the encoded ghost time — no server, no coordination, no login.
 *
 * Everything that decides a value here is PURE and unit-tested in
 * challenge.test.ts; the only impure code is the thin localStorage fence at the
 * bottom (so an accepted ghost survives a mid-solve refresh, degrading to a
 * plain solo when storage is unavailable).
 */

import { compressPuzzleToHash, puzzleFromHash } from "./puzzleUrl";
import type { Puzzle } from "../types/puzzle";

// --- Types ---

export interface ChallengePayload {
  /** The challenger's display name. */
  name: string;
  /** The challenger's finish time, whole seconds. */
  seconds: number;
}

export type ChallengeOutcome = "beat" | "lost" | "tied";

export interface ChallengeComparison {
  outcome: ChallengeOutcome;
  /** Absolute gap between the two times, whole seconds (0 when tied). */
  deltaSeconds: number;
}

// Query-param keys for the challenger's identity + time. Kept short and stable.
const NAME_PARAM = "cf"; // challenge-from
const TIME_PARAM = "ct"; // challenge-time
const MAX_NAME_LENGTH = 40;

function sanitizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

function clampSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
}

// --- Pure: encode / decode ---

/** Serialize the challenger's name + time to URL query params (no leading "?"). */
export function encodeChallengeParams(payload: ChallengePayload): string {
  const params = new URLSearchParams();
  params.set(NAME_PARAM, sanitizeName(payload.name));
  params.set(TIME_PARAM, String(clampSeconds(payload.seconds)));
  return params.toString();
}

/**
 * Parse the challenger's name + time from a query string. Returns null when the
 * challenge params are absent or malformed (empty name, non-integer/negative
 * time), so a stray query string never fakes a challenge.
 */
export function decodeChallengeParams(search: string): ChallengePayload | null {
  try {
    const q = search.startsWith("?") ? search.slice(1) : search;
    const params = new URLSearchParams(q);
    const rawName = params.get(NAME_PARAM);
    const rawTime = params.get(TIME_PARAM);
    if (rawName == null || rawTime == null) return null;
    const name = sanitizeName(rawName);
    if (!name) return null;
    const seconds = Number(rawTime);
    if (!Number.isInteger(seconds) || seconds < 0) return null;
    return { name, seconds };
  } catch {
    return null;
  }
}

/**
 * Build a self-contained challenge URL: challenger name + time in the query
 * string, the full puzzle in the reused `#puzzle=` hash. No server round-trip.
 */
export function buildChallengeUrl(
  origin: string,
  puzzle: Puzzle,
  payload: ChallengePayload,
): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/?${encodeChallengeParams(payload)}${compressPuzzleToHash(puzzle)}`;
}

/** Inverse of buildChallengeUrl: recover the puzzle + payload, or null. */
export function parseChallengeUrl(
  url: string,
): { puzzle: Puzzle; payload: ChallengePayload } | null {
  try {
    const u = new URL(url);
    const payload = decodeChallengeParams(u.search);
    if (!payload) return null;
    const puzzle = puzzleFromHash(u.hash);
    if (!puzzle) return null;
    return { puzzle, payload };
  } catch {
    return null;
  }
}

// --- Pure: comparison ---

/**
 * Compare a finisher's time against the challenger's ghost. Lower time wins;
 * `deltaSeconds` is the absolute whole-second gap. Times are floored/clamped so
 * the verdict stays honest against fractional or negative input.
 */
export function compareToChallenge(
  challengerSeconds: number,
  finisherSeconds: number,
): ChallengeComparison {
  const ghost = clampSeconds(challengerSeconds);
  const me = clampSeconds(finisherSeconds);
  if (me < ghost) return { outcome: "beat", deltaSeconds: ghost - me };
  if (me > ghost) return { outcome: "lost", deltaSeconds: me - ghost };
  return { outcome: "tied", deltaSeconds: 0 };
}

// --- Impure: localStorage (survives a mid-solve refresh; degrades gracefully) ---

const CHALLENGE_KEY = "crossword-clash-challenge";

export interface StoredChallenge extends ChallengePayload {
  /** puzzleIdentity of the puzzle this ghost belongs to. */
  key: string;
}

export function saveChallenge(challenge: StoredChallenge): void {
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
  } catch {
    // Best-effort — a lost ghost only degrades to a plain solo.
  }
}

export function loadChallenge(): StoredChallenge | null {
  try {
    const raw = localStorage.getItem(CHALLENGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.key !== "string" ||
      typeof parsed?.name !== "string" ||
      typeof parsed?.seconds !== "number"
    ) {
      return null;
    }
    return { key: parsed.key, name: parsed.name, seconds: parsed.seconds };
  } catch {
    return null;
  }
}

export function clearChallenge(): void {
  try {
    localStorage.removeItem(CHALLENGE_KEY);
  } catch {
    // ignore
  }
}
