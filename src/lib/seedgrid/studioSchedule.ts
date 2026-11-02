/**
 * The admin daily queue: which studio puzzles are scheduled as the daily on
 * which days, in which slot (the mini, or the 15×15 "large"). Stored in
 * Supabase `daily_schedule` through the token-gated studio-schedule edge
 * function; players get them from /daily-puzzles/<day>.json and
 * /daily-puzzles/large/<day>.json.
 *
 * A day is served in this order (vercel.json: real files win over rewrites):
 * a committed feed file under public/daily-puzzles/, else the schedule row,
 * else the mini's bundled rotation (the midi and large have no fallback).
 * The queue reads the daily index — which lists the committed files, future
 * days included — so it can say which of the three each day will get.
 */
import { dayKey } from "../soloStats";
import type { DailyFeedEntry, DailySlot } from "../dailyFeed";
import { fetchIndexMonth, monthOf, type DailyIndexEntry } from "../dailyIndex";
import { clueOk } from "./cluePrompt";
import { slotsOf, slotText } from "./grid";
import { toTransferPuzzle, type ClueSet } from "./ipuz";
import { slotKey, type StudioState } from "./studioState";
import { StudioClaudeError } from "./studioClaude";
import { studioHeaders } from "../studioAuth";

export interface ScheduledDay {
  day: string;
  slot: DailySlot;
  title: string;
  studio_id: string | null;
}

/** Grids this wide or taller go to the large slot by default; from MIDI_MIN_SIZE up to it, the midi. */
export const LARGE_MIN_SIZE = 11;
export const MIDI_MIN_SIZE = 8;

/** The slot a puzzle of this size belongs in: 15×15s are larges, 9×9s midis, 5×5s and 7×7s minis. */
export function defaultSlotFor(width: number, height: number): DailySlot {
  const size = Math.max(width, height);
  return size >= LARGE_MIN_SIZE ? "large" : size >= MIDI_MIN_SIZE ? "midi" : "mini";
}

/** A committed feed file the daily index lists: what the day will serve whatever the schedule says. */
export type StockedDay = Pick<DailyIndexEntry, "day" | "slot" | "title">;

export type DayServing =
  | { kind: "file"; title: string; shadowed: ScheduledDay | null }
  | { kind: "scheduled"; entry: ScheduledDay }
  | { kind: "rotation" }
  | { kind: "none" };

export const servingKey = (day: string, slot: DailySlot) => `${day}:${slot}`;

/** What a day's slot will serve: the file first, then the schedule, then the mini's rotation. */
export function servingFor(slot: DailySlot, file: StockedDay | undefined, scheduled: ScheduledDay | undefined): DayServing {
  if (file) return { kind: "file", title: file.title, shadowed: scheduled ?? null };
  if (scheduled) return { kind: "scheduled", entry: scheduled };
  return slot === "mini" ? { kind: "rotation" } : { kind: "none" };
}

/** "2026-10-30".."2026-11-02" → ["2026-10", "2026-11"]. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = monthOf(from); m <= monthOf(to); ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, "0")}`;
  }
  return months;
}

/** The committed feed files between two days, future days included (the index lists them). Never rejects. */
export async function fetchStockedDays(from: string, to: string): Promise<StockedDay[]> {
  const pages = await Promise.all(monthsBetween(from, to).map(fetchIndexMonth));
  return pages
    .flat()
    .filter((e) => e.day >= from && e.day <= to)
    .map(({ day, slot, title }) => ({ day, slot, title }));
}

/** The next `count` local calendar days, starting today. */
export function upcomingDays(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
}

/** Why this puzzle can't be a daily yet (empty when it can). */
export function scheduleProblems(state: StudioState): string[] {
  const problems: string[] = [];
  if (state.grid.cells.some((c) => c === "")) problems.push("Fill every square.");
  if (!state.title.trim()) problems.push("Give it a title.");
  const unclued = slotsOf(state.grid).filter((s) => {
    const clue = state.clues[slotKey(s)]?.trim() ?? "";
    return !clue || !clueOk(slotText(state.grid, s), clue);
  });
  if (unclued.length) problems.push(`Clue ${unclued.slice(0, 6).map((s) => s.id).join(", ")}${unclued.length > 6 ? ` and ${unclued.length - 6} more` : ""}.`);
  return problems;
}

/** The feed file for this puzzle: the same JSON as public/daily-puzzles/<day>.json. */
export function scheduleEntry(state: StudioState, label: string): DailyFeedEntry {
  const clues: Record<string, ClueSet> = {};
  for (const s of slotsOf(state.grid)) clues[s.id] = { standard: state.clues[slotKey(s)].trim() };
  const puzzle = toTransferPuzzle(state.grid, clues, { title: state.title.trim(), author: "Crossword Clash" });
  return { ...(label.trim() ? { theme: label.trim() } : {}), puzzle };
}

async function call<T>(token: string, body: unknown): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new StudioClaudeError("config", "Supabase isn't configured in this build.");
  const res = await fetch(`${url}/functions/v1/studio-schedule`, {
    method: "POST",
    headers: await studioHeaders(token),
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new StudioClaudeError("token", "Sign in as a studio admin, or enter the studio token.");
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new StudioClaudeError("failed", `Schedule request failed (${data.error ?? res.status}).`);
  return data;
}

export const listSchedule = (token: string, from: string, to: string) =>
  call<{ days: ScheduledDay[] }>(token, { action: "list", from, to }).then((r) => r.days);

export const scheduleDay = (token: string, day: string, slot: DailySlot, state: StudioState, label: string) =>
  call<{ ok: true }>(token, { action: "set", day, slot, entry: scheduleEntry(state, label), title: state.title.trim(), studioId: state.id });

export const unscheduleDay = (token: string, day: string, slot: DailySlot) => call<{ ok: true }>(token, { action: "remove", day, slot });
