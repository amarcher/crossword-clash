/**
 * The admin daily queue: which studio puzzles are scheduled as the daily on
 * which days. Stored in Supabase `daily_schedule` through the token-gated
 * studio-schedule edge function; players get them from /daily-puzzles/<day>.json.
 */
import { dayKey } from "../soloStats";
import type { DailyFeedEntry } from "../dailyFeed";
import { clueOk } from "./cluePrompt";
import { slotsOf, slotText } from "./grid";
import { toTransferPuzzle, type ClueSet } from "./ipuz";
import { slotKey, type StudioState } from "./studioState";
import { StudioClaudeError } from "./studioClaude";
import { studioHeaders } from "../studioAuth";

export interface ScheduledDay {
  day: string;
  title: string;
  studio_id: string | null;
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

export const scheduleDay = (token: string, day: string, state: StudioState, label: string) =>
  call<{ ok: true }>(token, { action: "set", day, entry: scheduleEntry(state, label), title: state.title.trim(), studioId: state.id });

export const unscheduleDay = (token: string, day: string) => call<{ ok: true }>(token, { action: "remove", day });
