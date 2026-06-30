/**
 * Narrator budget math — PURE, side-effect-free, framework-agnostic.
 *
 * The AI gameshow narrator (Anthropic commentary + ElevenLabs/OpenAI voice)
 * is the app's standout feature, but it costs real money per session. This
 * module turns rows from the shared `api_usage` ledger (Neon, written by the
 * edge functions via _shared/usageLog.ts) into a month-to-date dollar estimate
 * and an over/under-cap decision.
 *
 * It is the single source of truth for pricing + the cap decision. The Deno
 * edge functions mirror these constants in supabase/functions/_shared so the
 * server can enforce the cap, but ONLY this copy is typechecked by `tsc -b`
 * and exercised by vitest — keep the two in sync.
 *
 * Nothing here touches `import.meta.env`, `localStorage`, or the network, so
 * it runs identically in the Vite app, in tests, and (mirrored) under Deno.
 */

/** A single (optionally pre-aggregated) row of recorded API usage. */
export interface UsageRow {
  service?: string | null;
  endpoint?: string | null;
  model?: string | null;
  /** Anthropic input tokens (summed if the row is an aggregate). */
  tokensIn?: number | null;
  /** Anthropic output tokens. */
  tokensOut?: number | null;
  /** ElevenLabs TTS characters. */
  characters?: number | null;
  /**
   * Number of underlying ledger rows this object represents. Matters only for
   * per-session priced models (ElevenLabs Convai, OpenAI Realtime) where each
   * row is one issued session. Defaults to 1.
   */
  rows?: number | null;
}

/** Per-unit pricing for one billing "rate key". All amounts are whole USD. */
export interface RatePricing {
  /** USD per input token. */
  inputTokenUsd?: number;
  /** USD per output token. */
  outputTokenUsd?: number;
  /** USD per TTS character. */
  characterUsd?: number;
  /** USD charged per issued session row (per-minute models billed as assumed-max). */
  sessionUsd?: number;
}

export type NarratorPricing = Record<string, RatePricing>;

/**
 * Default pricing. Deliberately conservative (rounded UP) so the owner's spend
 * ceiling errs on the side of cutting the narrator off early rather than late.
 *
 * - Anthropic Claude Sonnet 4: $3 / 1M input tokens, $15 / 1M output tokens.
 * - ElevenLabs Flash v2.5 TTS: per character of synthesized speech.
 * - ElevenLabs Convai / OpenAI Realtime: billed per minute upstream; we only
 *   log session issuance, so each issued session is charged an assumed-max.
 */
export const DEFAULT_NARRATOR_PRICING: NarratorPricing = {
  "claude-sonnet-4-20250514": {
    inputTokenUsd: 3 / 1_000_000,
    outputTokenUsd: 15 / 1_000_000,
  },
  // ElevenLabs Conversational AI — assume a generous ~8-minute session.
  convai: { sessionUsd: 1.0 },
  // OpenAI Realtime audio is the priciest path — assume a costly session.
  "gpt-realtime": { sessionUsd: 1.5 },
  // ElevenLabs Flash v2.5 text-to-speech, per character.
  "elevenlabs:tts": { characterUsd: 0.00015 },
};

/** Default monthly spend ceiling (USD) when NARRATOR_MONTHLY_USD_CAP is unset. */
export const DEFAULT_MONTHLY_CAP_USD = 20;

/**
 * Resolve a billing rate key for a usage row. Model id wins (covers Claude,
 * Convai, and Realtime); otherwise fall back to `service:endpoint` (covers TTS
 * rows, which carry no model), then bare service.
 */
export function rateKeyForRow(row: UsageRow): string {
  if (row.model) return row.model;
  if (row.service && row.endpoint) return `${row.service}:${row.endpoint}`;
  return row.service ?? "unknown";
}

function nonNegative(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/** Estimated USD cost of a single usage row under the given pricing. */
export function estimateRowCostUsd(
  row: UsageRow,
  pricing: NarratorPricing = DEFAULT_NARRATOR_PRICING,
): number {
  const rate = pricing[rateKeyForRow(row)] ?? {};
  const rows = nonNegative(row.rows) || 1;
  return (
    nonNegative(row.tokensIn) * (rate.inputTokenUsd ?? 0) +
    nonNegative(row.tokensOut) * (rate.outputTokenUsd ?? 0) +
    nonNegative(row.characters) * (rate.characterUsd ?? 0) +
    (rate.sessionUsd ?? 0) * rows
  );
}

/** Sum the estimated month-to-date spend across all usage rows. */
export function estimateMonthlySpendUsd(
  rows: UsageRow[],
  pricing: NarratorPricing = DEFAULT_NARRATOR_PRICING,
): number {
  return rows.reduce((total, row) => total + estimateRowCostUsd(row, pricing), 0);
}

export interface BudgetStatus {
  /** Estimated month-to-date spend, USD. */
  spendUsd: number;
  /** Active spend ceiling, USD. */
  capUsd: number;
  /** True once estimated spend has reached or exceeded the cap. */
  overCap: boolean;
  /** Headroom remaining before the cap (never negative). */
  remainingUsd: number;
}

/**
 * Evaluate month-to-date usage against a dollar cap. `overCap` flips at-or-above
 * the cap (>=) so a budget sitting exactly at the ceiling is treated as spent.
 */
export function evaluateBudget(
  rows: UsageRow[],
  capUsd: number,
  pricing: NarratorPricing = DEFAULT_NARRATOR_PRICING,
): BudgetStatus {
  const cap = nonNegative(capUsd);
  const spendUsd = estimateMonthlySpendUsd(rows, pricing);
  return {
    spendUsd,
    capUsd: cap,
    overCap: spendUsd >= cap,
    remainingUsd: Math.max(0, cap - spendUsd),
  };
}

/**
 * Parse the NARRATOR_MONTHLY_USD_CAP env value into a positive dollar amount,
 * falling back to {@link DEFAULT_MONTHLY_CAP_USD} for missing/invalid input.
 */
export function resolveMonthlyCapUsd(
  envValue: string | undefined | null,
  fallback: number = DEFAULT_MONTHLY_CAP_USD,
): number {
  if (envValue == null || envValue.trim() === "") return fallback;
  const parsed = Number.parseFloat(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/* ------------------------------------------------------------------ *
 * Demo allowance
 *
 * So the narrator never feels "dead" to a first-time TV host even after the
 * monthly cap is hit, a brief sample is permitted on the cheapest path. The
 * client meters a few events locally; the server independently caps demo
 * grants per IP. Both layers use the helpers below so the limits are tested.
 * ------------------------------------------------------------------ */

/** Narrator events a first-time host may sample before the cap fully applies. */
export const DEFAULT_DEMO_EVENT_ALLOWANCE = 5;

/** Demo authorizations a single IP may receive from the server while over cap. */
export const DEFAULT_DEMO_GRANT_LIMIT = 2;

/**
 * Endpoints cheap enough to back a demo while over budget. The per-minute agent
 * endpoints are intentionally excluded so a demo can never open an expensive
 * realtime/Convai session.
 */
export const DEMO_ELIGIBLE_ENDPOINTS = ["narrator-claude", "tts"];

/** Remaining demo events for a client that has consumed `consumed` of them. */
export function demoEventsRemaining(
  consumed: number,
  allowance: number = DEFAULT_DEMO_EVENT_ALLOWANCE,
): number {
  const used = Math.max(0, Math.floor(nonNegative(consumed)));
  return Math.max(0, Math.max(0, Math.floor(allowance)) - used);
}

/** Whether a client still has any demo events left to sample. */
export function hasDemoRemaining(
  consumed: number,
  allowance: number = DEFAULT_DEMO_EVENT_ALLOWANCE,
): boolean {
  return demoEventsRemaining(consumed, allowance) > 0;
}

export interface DemoGrantQuery {
  endpoint: string;
  /** Demo grants this IP has already received this window. */
  priorGrants: number;
  /** Whether the request actually asked for demo mode. */
  demoRequested: boolean;
  grantLimit?: number;
  eligibleEndpoints?: string[];
}

/**
 * Decide whether an over-cap request may be served as a free demo. Requires the
 * caller to have asked for a demo, the endpoint to be demo-eligible, and the
 * IP to be under its grant limit.
 */
export function canGrantDemo({
  endpoint,
  priorGrants,
  demoRequested,
  grantLimit = DEFAULT_DEMO_GRANT_LIMIT,
  eligibleEndpoints = DEMO_ELIGIBLE_ENDPOINTS,
}: DemoGrantQuery): boolean {
  if (!demoRequested) return false;
  if (!eligibleEndpoints.includes(endpoint)) return false;
  return Math.max(0, Math.floor(nonNegative(priorGrants))) < Math.floor(grantLimit);
}

/** Machine-readable signal returned to clients when the narrator is over budget. */
export const NARRATOR_UNAVAILABLE_BUDGET = "narrator_unavailable:budget";

/** Shape of the JSON body edge functions return when refusing on budget. */
export interface NarratorUnavailableBody {
  error: "narrator_unavailable";
  reason: "budget";
}

export const NARRATOR_UNAVAILABLE_BODY: NarratorUnavailableBody = {
  error: "narrator_unavailable",
  reason: "budget",
};
