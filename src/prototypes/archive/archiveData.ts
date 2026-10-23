/**
 * PROTOTYPE — throwaway. Status derivation and fake history for the
 * /prototype/archive variants. See docs/puzzle-archive-spec.md §3.
 */
import type { DailyIndexEntry } from "../../lib/dailyIndex";
import type { DailySlot } from "../../lib/dailyFeed";
import { daysBetween } from "../../lib/soloStats";

export type ArchiveStatus = "solved" | "inprogress" | "unsolved";

export interface ArchiveItem extends DailyIndexEntry {
  status: ArchiveStatus;
  /** Best time in whole seconds when solved. */
  seconds: number | null;
}

export function deriveItems(
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

// --- Fake history (so the variants can be judged with every state present) ---

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const FAKE_RANGE: Record<DailySlot, [number, number]> = { mini: [48, 190], midi: [170, 520], large: [540, 1500] };

export interface FakeHistory {
  bestTimes: Record<string, number>;
  inProgressIdentity: string | null;
  streak: number;
}

/** Roughly 60% of past days solved, today's mini solved, yesterday's large in progress, a 5-day streak. */
export function fakeHistory(entries: readonly DailyIndexEntry[], today: string): FakeHistory {
  const bestTimes: Record<string, number> = {};
  let inProgressIdentity: string | null = null;
  for (const e of entries) {
    const h = hash(e.identity);
    const [lo, hi] = FAKE_RANGE[e.slot];
    const jitter = (h >>> 20) % 11;
    const ago = daysBetween(e.day, today);
    if (ago === 0) {
      if (e.slot === "mini") bestTimes[e.identity] = lo + (h % (hi - lo)) + jitter;
      continue;
    }
    if (ago === 1 && e.slot === "large") {
      inProgressIdentity = e.identity;
      continue;
    }
    if (h % 10 < 6) bestTimes[e.identity] = lo + (h % (hi - lo)) + jitter;
  }
  return { bestTimes, inProgressIdentity, streak: 5 };
}

// --- Dates ---

export function toDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftDay(day: string, n: number): string {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return fromDate(d);
}

/** The Sunday on or before `day`. */
export function weekStart(day: string): string {
  return shiftDay(day, -toDate(day).getDay());
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

export function weekdayInitial(index: number, locale: string): string {
  // 2026-10-04 is a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2026, 9, 4 + index));
}

export interface WeekGroup {
  start: string;
  label: string;
  /** Newest day first. */
  items: ArchiveItem[];
}

/** Items grouped by week (Sunday start), newest week first. */
export function groupByWeek(items: readonly ArchiveItem[], today: string, locale: string): WeekGroup[] {
  const thisWeek = weekStart(today);
  const lastWeek = shiftDay(thisWeek, -7);
  const groups = new Map<string, ArchiveItem[]>();
  for (const item of items) {
    const start = weekStart(item.day);
    groups.set(start, [...(groups.get(start) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([start, list]) => ({
      start,
      label:
        start === thisWeek
          ? "This week"
          : start === lastWeek
            ? "Last week"
            : `${shortDay(start, locale)} – ${shortDay(shiftDay(start, 6), locale)}`,
      items: [...list].sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1)),
    }));
}

/** Slot order for a day's rows. */
export const SLOT_ORDER: DailySlot[] = ["mini", "midi", "large"];
