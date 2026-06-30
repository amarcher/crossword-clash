/**
 * Narrator budget math — Deno MIRROR of src/lib/narratorBudget.ts.
 *
 * Edge functions run under Deno and are NOT covered by `tsc -b` or vitest, so
 * the authoritative, tested copy lives in src/lib/narratorBudget.ts. This file
 * mirrors its pricing constants and pure functions so the server can enforce
 * the same cap. Keep the two in sync — any pricing change must be made in both.
 */

export interface UsageRow {
  service?: string | null;
  endpoint?: string | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  characters?: number | null;
  rows?: number | null;
}

export interface RatePricing {
  inputTokenUsd?: number;
  outputTokenUsd?: number;
  characterUsd?: number;
  sessionUsd?: number;
}

export type NarratorPricing = Record<string, RatePricing>;

export const DEFAULT_NARRATOR_PRICING: NarratorPricing = {
  "claude-sonnet-4-20250514": {
    inputTokenUsd: 3 / 1_000_000,
    outputTokenUsd: 15 / 1_000_000,
  },
  convai: { sessionUsd: 1.0 },
  "gpt-realtime": { sessionUsd: 1.5 },
  "elevenlabs:tts": { characterUsd: 0.00015 },
};

export const DEFAULT_MONTHLY_CAP_USD = 20;
export const DEFAULT_DEMO_GRANT_LIMIT = 2;
export const DEMO_ELIGIBLE_ENDPOINTS = ["narrator-claude", "tts"];

export const NARRATOR_UNAVAILABLE_BODY = {
  error: "narrator_unavailable",
  reason: "budget",
} as const;

export function rateKeyForRow(row: UsageRow): string {
  if (row.model) return row.model;
  if (row.service && row.endpoint) return `${row.service}:${row.endpoint}`;
  return row.service ?? "unknown";
}

function nonNegative(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

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

export function estimateMonthlySpendUsd(
  rows: UsageRow[],
  pricing: NarratorPricing = DEFAULT_NARRATOR_PRICING,
): number {
  return rows.reduce((total, row) => total + estimateRowCostUsd(row, pricing), 0);
}

export interface BudgetStatus {
  spendUsd: number;
  capUsd: number;
  overCap: boolean;
  remainingUsd: number;
}

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

export function resolveMonthlyCapUsd(
  envValue: string | undefined | null,
  fallback: number = DEFAULT_MONTHLY_CAP_USD,
): number {
  if (envValue == null || envValue.trim() === "") return fallback;
  const parsed = Number.parseFloat(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface DemoGrantQuery {
  endpoint: string;
  priorGrants: number;
  demoRequested: boolean;
  grantLimit?: number;
  eligibleEndpoints?: string[];
}

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
