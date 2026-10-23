/**
 * The daily archive index: one small entry per published daily, generated
 * at build time from the feed files (scripts/build-daily-index.mts, the
 * same way the classics' manifest is built) and served as static files
 * under /daily-puzzles/ so the apps read it with the feed's CORS header.
 *
 *   /daily-puzzles/index.json            { first, last, months: ["2026-10", …] }
 *   /daily-puzzles/index/2026-10.json    DailyIndexEntry[] for that month
 *
 * The files include days that have not arrived yet (the feed's static files
 * do too), so readers filter to `day <= today` themselves — see
 * `publishedEntries`. Status (solved, in progress) is never stored here;
 * the client derives it from `identity` and its own history.
 *
 * Pure helpers first, fetchers at the bottom. Spec: docs/puzzle-archive-spec.md.
 */
import { DAILY_SLOTS, DAILY_FEED_PATH, displayTheme, type DailySlot } from "./dailyFeed";
import type { DailyMini } from "./dailyMinis";
import { puzzleIdentity } from "./soloStats";
import type { Puzzle } from "../types/puzzle";

export interface DailyIndexEntry {
  /** The daily's own day, "YYYY-MM-DD". */
  day: string;
  slot: DailySlot;
  title: string;
  /** The theme shown beside the puzzle; "" when none or when it repeats the title. */
  theme: string;
  author: string;
  width: number;
  height: number;
  clues: number;
  /** `puzzleIdentity()` — the key into best times (local stats or the account's solves). */
  identity: string;
  /** Grid shape for a thumbnail: rows joined by "/", "." white, "#" black. */
  blocks: string;
}

export interface DailyIndexSummary {
  first: string;
  last: string;
  /** "YYYY-MM", ascending. */
  months: string[];
}

const SLOT_ORDER: Record<DailySlot, number> = { mini: 0, midi: 1, large: 2 };

// --- Pure ---

export function blocksOf(puzzle: Pick<Puzzle, "cells">): string {
  return puzzle.cells.map((row) => row.map((c) => (c.solution === null ? "#" : ".")).join("")).join("/");
}

export function indexEntryFor(day: string, slot: DailySlot, daily: DailyMini): DailyIndexEntry {
  const p = daily.puzzle;
  return {
    day,
    slot,
    title: p.title,
    theme: displayTheme(daily),
    author: p.author ?? "",
    width: p.width,
    height: p.height,
    clues: p.clues.length,
    identity: puzzleIdentity(p),
    blocks: blocksOf(p),
  };
}

/** "2026-10-20" → "2026-10". */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Ascending by day, then mini → midi → large. */
export function sortEntries(entries: readonly DailyIndexEntry[]): DailyIndexEntry[] {
  return [...entries].sort((a, b) => (a.day === b.day ? SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] : a.day < b.day ? -1 : 1));
}

export function isDailyIndexEntry(value: unknown): value is DailyIndexEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.day === "string" &&
    (DAILY_SLOTS as readonly unknown[]).includes(e.slot) &&
    typeof e.title === "string" &&
    typeof e.theme === "string" &&
    typeof e.author === "string" &&
    typeof e.width === "number" &&
    typeof e.height === "number" &&
    typeof e.clues === "number" &&
    typeof e.identity === "string" &&
    typeof e.blocks === "string"
  );
}

export function parseIndexMonth(data: unknown): DailyIndexEntry[] {
  return Array.isArray(data) ? sortEntries(data.filter(isDailyIndexEntry)) : [];
}

export function parseIndexSummary(data: unknown): DailyIndexSummary | null {
  if (typeof data !== "object" || data === null) return null;
  const s = data as Record<string, unknown>;
  if (typeof s.first !== "string" || typeof s.last !== "string" || !Array.isArray(s.months)) return null;
  return { first: s.first, last: s.last, months: s.months.filter((m): m is string => typeof m === "string") };
}

/** The entries a visitor may see: nothing after `today` ("YYYY-MM-DD"). */
export function publishedEntries(entries: readonly DailyIndexEntry[], today: string): DailyIndexEntry[] {
  return entries.filter((e) => e.day <= today);
}

export function indexSummaryPath(): string {
  return `${DAILY_FEED_PATH}/index.json`;
}

export function indexMonthPath(month: string): string {
  return `${DAILY_FEED_PATH}/index/${month}.json`;
}

// --- Fetch (never rejects; [] / null on failure) ---

const FEED_ORIGIN = import.meta.env?.MODE === "mobile" ? "https://crosswordclash.com" : "";

export async function fetchIndexSummary(): Promise<DailyIndexSummary | null> {
  try {
    const res = await fetch(`${FEED_ORIGIN}${indexSummaryPath()}`);
    if (!res.ok) return null;
    return parseIndexSummary(await res.json());
  } catch {
    return null;
  }
}

export async function fetchIndexMonth(month: string): Promise<DailyIndexEntry[]> {
  try {
    const res = await fetch(`${FEED_ORIGIN}${indexMonthPath(month)}`);
    if (!res.ok) return [];
    return parseIndexMonth(await res.json());
  } catch {
    return [];
  }
}

/** Every entry up to and including `today`, newest month first in the fetch order. */
export async function fetchPublishedIndex(today: string): Promise<DailyIndexEntry[]> {
  const summary = await fetchIndexSummary();
  if (!summary) return [];
  const months = summary.months.filter((m) => m <= monthOf(today));
  const pages = await Promise.all(months.map(fetchIndexMonth));
  return publishedEntries(sortEntries(pages.flat()), today);
}
