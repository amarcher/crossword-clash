/**
 * The past-puzzles archive (/archive): pure helpers behind ArchiveScreen.
 *
 * The archive lists every published daily (the generated index in
 * dailyIndex.ts) with the viewer's own status, which is DERIVED here and
 * never stored: solved + best time from the best-times map (local stats or
 * the account's solves, both keyed by `puzzleIdentity()`), "in progress"
 * for the one solo game the device would resume, unsolved otherwise. The
 * calendar math (month cells, Sunday start) lives here too so the screen
 * only renders. Spec: docs/puzzle-archive-spec.md.
 */
import type { DailyIndexEntry } from "./dailyIndex";
import type { DailySlot } from "./dailyFeed";
import { puzzleIdentity, type SoloTimerRecord } from "./soloStats";
import type { CellState, Puzzle } from "../types/puzzle";

export type ArchiveStatus = "solved" | "inprogress" | "unsolved";

export interface ArchiveItem extends DailyIndexEntry {
  status: ArchiveStatus;
  /** Best time in whole seconds when solved, else null. */
  seconds: number | null;
}

export const SLOT_ORDER: readonly DailySlot[] = ["mini", "midi", "large"];

// --- Status ---

/**
 * The identity of the solo game the device would resume — the saved
 * session's puzzle, provided the player has typed something and the clock
 * does not say it is finished. Null when there is nothing to resume.
 */
export function resumableIdentity(
  saved:
    | { puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells">; playerCells?: Record<string, CellState> | null }
    | null
    | undefined,
  timer: SoloTimerRecord | null | undefined,
): string | null {
  if (!saved?.puzzle) return null;
  if (!saved.playerCells || Object.keys(saved.playerCells).length === 0) return null;
  const id = puzzleIdentity(saved.puzzle);
  if (timer?.key === id && timer.completed) return null;
  return id;
}

/** Solved wins over in-progress (a replay of a solved puzzle is still solved). */
export function deriveArchiveItems(
  entries: readonly DailyIndexEntry[],
  bestTimes: Readonly<Record<string, number>>,
  inProgressIdentity: string | null,
): ArchiveItem[] {
  return entries.map((e) => {
    const best = bestTimes[e.identity];
    if (typeof best === "number") return { ...e, status: "solved", seconds: best };
    if (e.identity === inProgressIdentity) return { ...e, status: "inprogress", seconds: null };
    return { ...e, status: "unsolved", seconds: null };
  });
}

export interface ArchiveCounts {
  total: number;
  solved: number;
  /** Everything not solved, in-progress included. */
  left: number;
}

export function archiveCounts(items: readonly Pick<ArchiveItem, "status">[]): ArchiveCounts {
  const solved = items.filter((i) => i.status === "solved").length;
  return { total: items.length, solved, left: items.length - solved };
}

/** Items by day, each day's list in slot order. */
export function groupByDay(items: readonly ArchiveItem[]): Map<string, ArchiveItem[]> {
  const out = new Map<string, ArchiveItem[]>();
  for (const it of items) out.set(it.day, [...(out.get(it.day) ?? []), it]);
  for (const list of out.values()) list.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return out;
}

/** The newest in-progress item, or null. */
export function resumableItem(items: readonly ArchiveItem[]): ArchiveItem | null {
  let best: ArchiveItem | null = null;
  for (const it of items) if (it.status === "inprogress" && (!best || it.day > best.day)) best = it;
  return best;
}

// --- Dates (local calendar, "YYYY-MM-DD" / "YYYY-MM") ---

export function toDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** "2026-10" shifted by `n` months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A month as calendar cells, Sunday first: leading nulls for the days
 * before the 1st, then every day of the month, then nulls to a full week.
 */
export function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Where the calendar opens: today when today has a daily, else the latest
 * published day; the month is that day's. Null when there is nothing.
 */
export function defaultSelection(items: readonly Pick<ArchiveItem, "day">[], today: string): { day: string; month: string } | null {
  if (items.length === 0) return null;
  let latest = items[0].day;
  for (const it of items) {
    if (it.day === today) return { day: today, month: monthOf(today) };
    if (it.day > latest) latest = it.day;
  }
  return { day: latest, month: monthOf(latest) };
}

export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export function longDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(toDate(day));
}

export function shortDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(toDate(day));
}

/** Narrow weekday names, Sunday first. */
export function weekdayInitials(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 2026-10-04 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 9, 4 + i)));
}
