import { neon } from "npm:@neondatabase/serverless";
import { corsHeaders } from "./cors.ts";
import { countDemoGrants, recordDemoGrant } from "./rateLimit.ts";
import {
  canGrantDemo,
  evaluateBudget,
  NARRATOR_UNAVAILABLE_BODY,
  resolveMonthlyCapUsd,
  type UsageRow,
} from "./narratorBudget.ts";

/**
 * Hard, env-configurable monthly spend ceiling for the AI narrator.
 *
 * Queries rolling month-to-date spend from the Neon `api_usage` ledger (the
 * same table the edge functions already write via _shared/usageLog.ts), prices
 * it with the mirrored narratorBudget module, and refuses to authorize a
 * narrator/TTS request once combined Anthropic + ElevenLabs + OpenAI estimated
 * spend reaches NARRATOR_MONTHLY_USD_CAP (default $20).
 *
 * Refusals return { error:'narrator_unavailable', reason:'budget' } with HTTP
 * 402 so clients can degrade gracefully. A bounded per-IP demo allowance lets a
 * first-time host still sample the cheapest path briefly while over budget.
 *
 * Fails OPEN only when spend genuinely cannot be measured (no DASHBOARD_DATABASE_URL
 * or a query error) — matching the rate-limiter's posture of not hard-blocking
 * on infra hiccups.
 */
function demoRequested(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.get("demo") === "1";
  } catch {
    return false;
  }
}

export async function checkNarratorBudget(
  req: Request,
  endpoint: string,
): Promise<Response | null> {
  const dbUrl = Deno.env.get("DASHBOARD_DATABASE_URL");
  if (!dbUrl) return null; // can't measure spend → don't hard-block

  const capUsd = resolveMonthlyCapUsd(Deno.env.get("NARRATOR_MONTHLY_USD_CAP"));

  let rows: UsageRow[];
  try {
    const sql = neon(dbUrl);
    const result = (await sql`
      SELECT service, endpoint, model,
        COALESCE(SUM(tokens_in), 0)::bigint  AS tokens_in,
        COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out,
        COALESCE(SUM(characters), 0)::bigint AS characters,
        COUNT(*)::bigint AS rows
      FROM api_usage
      WHERE project = 'crossword-clash'
        AND created_at >= date_trunc('month', now())
      GROUP BY service, endpoint, model
    `) as Record<string, unknown>[];

    rows = result.map((r) => ({
      service: (r.service as string | null) ?? null,
      endpoint: (r.endpoint as string | null) ?? null,
      model: (r.model as string | null) ?? null,
      tokensIn: Number(r.tokens_in ?? 0),
      tokensOut: Number(r.tokens_out ?? 0),
      characters: Number(r.characters ?? 0),
      rows: Number(r.rows ?? 0),
    }));
  } catch (e) {
    console.error(`[${endpoint}] budget check query failed:`, e);
    return null; // fail open on DB error
  }

  const status = evaluateBudget(rows, capUsd);
  if (!status.overCap) return null;

  // Over the cap. Allow a brief, bounded demo on cheap endpoints if asked for.
  if (demoRequested(req)) {
    const priorGrants = await countDemoGrants(req, endpoint);
    if (canGrantDemo({ endpoint, priorGrants, demoRequested: true })) {
      await recordDemoGrant(req, endpoint);
      return null; // proceed as a metered demo
    }
  }

  return new Response(JSON.stringify(NARRATOR_UNAVAILABLE_BODY), {
    status: 402,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
