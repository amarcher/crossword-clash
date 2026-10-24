/**
 * A Plus subscriber's studio drafting allowance, read from their own
 * `feature_usage` row for the current UTC month (RLS: select-own). The server
 * meters through consume_allowance; this only shows what is left.
 */
import { supabase } from "./supabaseClient";

/** Mirrors STUDIO_CLAUDE_CALLS_PER_MONTH in supabase/functions/_shared/plusAccess.ts. */
export const STUDIO_CLAUDE_CALLS_PER_MONTH = 40;

export interface StudioAllowance {
  used: number;
  /** The plan's allowance plus any bonus credits. */
  limit: number;
  /** "YYYY-MM-01" */
  month: string;
}

/** The first day of the UTC month `now` falls in, as the `feature_usage.month` key. */
export function usageMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function allowanceLeft(a: StudioAllowance): number {
  return Math.max(0, a.limit - a.used);
}

export async function fetchStudioAllowance(userId: string, now: Date = new Date()): Promise<StudioAllowance> {
  const none = { used: 0, limit: STUDIO_CLAUDE_CALLS_PER_MONTH, month: usageMonth(now) };
  if (!supabase) return none;
  const { data, error } = await supabase
    .from("feature_usage")
    .select("used, bonus, month")
    .eq("user_id", userId)
    .eq("feature", "studio_claude")
    .eq("month", none.month)
    .maybeSingle();
  if (error || !data) return none;
  return { used: data.used, limit: STUDIO_CLAUDE_CALLS_PER_MONTH + data.bonus, month: none.month };
}
