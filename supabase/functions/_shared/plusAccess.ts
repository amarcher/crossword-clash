import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { countDemoGrants, recordDemoGrant } from "./rateLimit.ts";
import { canGrantDemo } from "./narratorBudget.ts";
import { serviceClient, userFromRequest, type CallerUser } from "./user.ts";

/**
 * Plus on the server (docs/monetization-spec.md §2.2–2.3, §3.6): who is
 * calling, whether they hold Plus, and the metered allowances.
 *
 * `PLUS_GATES` is the server half of the client's VITE_PLUS launch switch.
 * While it is unset every function behaves exactly as before Plus existed
 * (shared budget cap, demo only when over budget), so the functions can be
 * deployed ahead of launch. Set `PLUS_GATES=1` together with VITE_PLUS.
 */
export function plusGatesOn(): boolean {
  return Deno.env.get("PLUS_GATES") === "1";
}

// The allowances (spec decisions 3 and 4). Units: narrator minutes, Claude calls.
export const NARRATOR_MINUTES_PER_MONTH = 60;
export const STUDIO_CLAUDE_CALLS_PER_MONTH = 40;
/** A realtime agent session (ElevenLabs, OpenAI) is charged this many minutes when its token is granted. */
export const AGENT_GRANT_MINUTES = 10;
/** The Claude narrator path is charged one minute per this many narrator-claude calls (a game is ~30–40 events over ~10 minutes). */
export const CLAUDE_CALLS_PER_MINUTE = 6;
/** The Plus studio drafts with Sonnet; Opus stays admin-only. */
export const STUDIO_PLUS_MODEL = "claude-sonnet-5-5";
export const STUDIO_PLUS_MAX_TOKENS = 8000;
/** Per-user studio-claude rate limit for subscribers (the admin keeps the per-IP 120/h). */
export const STUDIO_PLUS_CALLS_PER_HOUR = 30;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export async function hasEntitlement(admin: SupabaseClient, userId: string, product = "plus"): Promise<boolean> {
  const { data, error } = await admin.rpc("has_entitlement", { p_user: userId, p_product: product });
  if (error) {
    console.error("has_entitlement failed:", error);
    return false; // fail closed: no Plus without proof
  }
  return data === true;
}

export interface AllowanceResult {
  allowed: boolean;
  used: number;
  bonus: number;
  /** "YYYY-MM-01" */
  month: string;
}

/** Atomically takes `amount` of this month's `feature` allowance for the user (consume_allowance). Fails CLOSED on error. */
export async function consumeAllowance(admin: SupabaseClient, userId: string, feature: string, amount: number, limit: number): Promise<AllowanceResult> {
  const { data, error } = await admin.rpc("consume_allowance", { p_user: userId, p_feature: feature, p_amount: amount, p_limit: limit });
  if (error || !Array.isArray(data) || data.length === 0) {
    console.error("consume_allowance failed:", error);
    return { allowed: false, used: 0, bonus: 0, month: "" };
  }
  const row = data[0] as AllowanceResult;
  return { allowed: !!row.allowed, used: Number(row.used ?? 0), bonus: Number(row.bonus ?? 0), month: String(row.month ?? "") };
}

/** The first instant of next month (UTC), when every allowance resets. */
export function nextMonthStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** 402 for a subscriber whose monthly allowance for a feature is used up. */
export function allowanceExhaustedResponse(feature: string, result: AllowanceResult, limit: number): Response {
  return json(
    {
      error: "allowance_exhausted",
      feature,
      used: result.used,
      limit: limit + result.bonus,
      resetsAt: nextMonthStart(),
    },
    402,
  );
}

/** 402 for a non-subscriber asking for a Plus feature (the client falls back to the demo, then to the upsell). */
export function plusRequiredResponse(): Response {
  return json({ error: "narrator_unavailable", reason: "plus" }, 402);
}

export type Caller = { user: CallerUser | null; plus: boolean };

/** Who is calling and whether they hold Plus. The anon key names no user. */
export async function callerWithPlus(req: Request, admin: SupabaseClient = serviceClient()): Promise<Caller> {
  const user = await userFromRequest(req, admin);
  if (!user) return { user: null, plus: false };
  return { user, plus: await hasEntitlement(admin, user.id) };
}

function demoRequested(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.get("demo") === "1";
  } catch {
    return false;
  }
}

/**
 * The narrator gate (spec §2.3), run after the per-IP rate limit and before
 * the global budget backstop. With PLUS_GATES on:
 *
 *   subscriber → `minutes` taken from the 60-minute allowance (402
 *                allowance_exhausted when it does not fit);
 *   anyone else → the demo only: a `?demo=1` request on a demo-eligible
 *                endpoint, within the per-IP grant limit (the same bounded
 *                demo as before Plus); otherwise 402 reason "plus".
 *
 * `minutes` may be 0 (tts: the Claude path is metered on narrator-claude).
 * Returns the refusal, or null to proceed.
 */
export async function narratorGate(req: Request, endpoint: string, minutes: number, admin: SupabaseClient = serviceClient()): Promise<Response | null> {
  if (!plusGatesOn()) return null;
  const { user, plus } = await callerWithPlus(req, admin);
  if (user && plus) {
    if (minutes <= 0) return null;
    const result = await consumeAllowance(admin, user.id, "narrator_minutes", minutes, NARRATOR_MINUTES_PER_MONTH);
    return result.allowed ? null : allowanceExhaustedResponse("narrator_minutes", result, NARRATOR_MINUTES_PER_MONTH);
  }
  return demoOnly(req, endpoint);
}

/**
 * The non-subscriber path: a `?demo=1` request on a demo-eligible endpoint
 * within the per-IP grant limit proceeds (and spends a grant); anything else
 * is refused with reason "plus".
 */
export async function demoOnly(req: Request, endpoint: string): Promise<Response | null> {
  if (demoRequested(req)) {
    const priorGrants = await countDemoGrants(req, endpoint);
    if (canGrantDemo({ endpoint, priorGrants, demoRequested: true })) {
      await recordDemoGrant(req, endpoint);
      return null;
    }
  }
  return plusRequiredResponse();
}

/**
 * The Claude narrator's metering: every CLAUDE_CALLS_PER_MINUTE-th call of
 * the month costs one narrator minute. Calls are counted in feature_usage
 * under `narrator_claude_calls` (no limit of their own); the minute is taken
 * on calls 1, 7, 13, … so a game's first event already needs a minute.
 * Returns the refusal, or null to proceed. Only for subscribers.
 */
export async function chargeClaudeCall(admin: SupabaseClient, userId: string): Promise<Response | null> {
  const calls = await consumeAllowance(admin, userId, "narrator_claude_calls", 1, Number.MAX_SAFE_INTEGER);
  if (!calls.allowed) return allowanceExhaustedResponse("narrator_minutes", { allowed: false, used: 0, bonus: 0, month: "" }, NARRATOR_MINUTES_PER_MONTH);
  if ((calls.used - 1) % CLAUDE_CALLS_PER_MINUTE !== 0) return null;
  const minutes = await consumeAllowance(admin, userId, "narrator_minutes", 1, NARRATOR_MINUTES_PER_MONTH);
  return minutes.allowed ? null : allowanceExhaustedResponse("narrator_minutes", minutes, NARRATOR_MINUTES_PER_MONTH);
}

/** Active Plus subscribers right now, for the budget backstop's cap (spec §2.3: 20 + 2 × subscribers). */
export async function activePlusCount(admin: SupabaseClient = serviceClient()): Promise<number> {
  const { count, error } = await admin
    .from("entitlements")
    .select("*", { count: "exact", head: true })
    .eq("product", "plus")
    .in("status", ["active", "grace"])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error) {
    console.error("active plus count failed:", error);
    return 0;
  }
  return count ?? 0;
}
