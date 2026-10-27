/**
 * The admin's report queue (docs/community-puzzles-spec.md §3.3): what the
 * studio-moderate edge function answers and the one call that drives every
 * action, plus the pure bits the panel shows (reason counts, the suggested
 * action for a repeat offender).
 */
import { StudioClaudeError } from "./seedgrid/studioClaude";
import { studioHeaders } from "./studioAuth";
import type { TransferPuzzle } from "./puzzleNormalizer";
import type { RemovedReason, ReportReason } from "./communityPuzzles";

export interface QueuePuzzle {
  id: string;
  short_id: string;
  author_id: string;
  author: string;
  studio_id: string;
  status: "published" | "held" | "unpublished" | "removed";
  title: string;
  notes: string;
  difficulty: "easy" | "medium" | "hard";
  lang: "en" | "es";
  width: number;
  height: number;
  clue_count: number;
  puzzle: TransferPuzzle | Record<string, never>;
  plays: number;
  solves: number;
  published_at: string;
  removed_reason: RemovedReason | null;
  moderated_at: string | null;
  moderation_note: string | null;
}

export interface QueueReport {
  id: string;
  reason: ReportReason;
  details: string;
  created_at: string;
}

export interface QueueItem {
  puzzle: QueuePuzzle;
  publisher: { user_id: string; strikes: number; banned_at: string | null } | null;
  reports: QueueReport[];
}

export interface ModerationQueue {
  items: QueueItem[];
  removed: QueuePuzzle[];
}

export type ModerationReason = ReportReason | "copyright";
export const MODERATION_REASONS: readonly ModerationReason[] = ["copied", "offensive", "nonsense", "other", "copyright"];
export type ModerationAction = "dismiss" | "remove" | "ban" | "restore";

/** Strikes at which "Remove" should default to "Remove and stop this author" (the third removal, spec §3.3). */
export const BAN_AT_STRIKES = 2;

/** "copied ×2 · nonsense ×1", most frequent first. */
export function reasonSummary(reports: readonly Pick<QueueReport, "reason">[]): string {
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, n]) => `${reason} ×${n}`)
    .join(" · ");
}

/** The reason most reporters gave, for the remove form's default. */
export function topReason(reports: readonly Pick<QueueReport, "reason">[]): ModerationReason {
  const summary = reasonSummary(reports);
  const first = summary.split(" ")[0] as ModerationReason | "";
  return first && MODERATION_REASONS.includes(first) ? first : "other";
}

/** Whether the next removal should stop the author: two strikes already (so this is the third). */
export function suggestsBan(item: Pick<QueueItem, "publisher">): boolean {
  return (item.publisher?.strikes ?? 0) >= BAN_AT_STRIKES && !item.publisher?.banned_at;
}

async function call<T>(token: string, body: unknown): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new StudioClaudeError("config", "Supabase isn't configured in this build.");
  const res = await fetch(`${url}/functions/v1/studio-moderate`, {
    method: "POST",
    headers: await studioHeaders(token),
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new StudioClaudeError("token", "Sign in as a studio admin, or enter the studio token.");
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new StudioClaudeError("failed", `Moderation request failed (${data.error ?? res.status}).`);
  return data;
}

export const fetchModerationQueue = (token: string) => call<ModerationQueue>(token, { action: "queue" });

export const moderatePuzzle = (token: string, action: ModerationAction, puzzleId: string, reason?: ModerationReason, note?: string) =>
  call<{ ok: true; strikes?: number }>(token, { action, puzzleId, ...(reason ? { reason } : {}), ...(note?.trim() ? { note: note.trim() } : {}) });
