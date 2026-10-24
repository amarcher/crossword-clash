import { corsHeaders } from "../_shared/cors.ts";
import { studioAccess } from "../_shared/studioAuth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { checkNarratorBudget } from "../_shared/budgetGuard.ts";
import { logUsage } from "../_shared/usageLog.ts";
import { serviceClient } from "../_shared/user.ts";
import {
  allowanceExhaustedResponse,
  consumeAllowance,
  STUDIO_CLAUDE_CALLS_PER_MONTH,
  STUDIO_PLUS_CALLS_PER_HOUR,
  STUDIO_PLUS_MAX_TOKENS,
  STUDIO_PLUS_MODEL,
} from "../_shared/plusAccess.ts";

/**
 * Claude for the construction studio (/studio): one structured-output call per
 * request (clue drafts, alternatives). The studio builds the prompt with
 * src/lib/seedgrid/cluePrompt.ts; this function only gates and forwards it.
 *
 * Two kinds of caller (studioAccess, docs/monetization-spec.md §2.2):
 *
 *   admin  the STUDIO_TOKEN secret or a signed-in studio admin. Per-IP rate
 *          limit, the shared monthly AI spend cap, any allow-listed model.
 *   plus   a Plus subscriber (PLUS_GATES on). Per-USER rate limit, one call
 *          taken from the monthly allowance of STUDIO_CLAUDE_CALLS_PER_MONTH
 *          (402 allowance_exhausted when spent), the model forced to Sonnet
 *          and output capped, then the shared cap as a backstop.
 *
 * Models and output size are allowlisted either way.
 */
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);
const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;
const MAX_PROMPT_CHARS = 40000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Structured output requires every object schema to forbid extra keys. */
function closed(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closed);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = closed(v);
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const access = await studioAccess(req);
  if (!access) return json({ error: "unauthorized" }, 401);

  if (access.kind === "plus") {
    const rateLimitResponse = await checkRateLimit(req, "studio-claude", { key: `user:${access.userId}`, maxRequests: STUDIO_PLUS_CALLS_PER_HOUR });
    if (rateLimitResponse) return rateLimitResponse;
    const allowance = await consumeAllowance(serviceClient(), access.userId, "studio_claude", 1, STUDIO_CLAUDE_CALLS_PER_MONTH);
    if (!allowance.allowed) return allowanceExhaustedResponse("studio_claude", allowance, STUDIO_CLAUDE_CALLS_PER_MONTH);
  } else {
    const rateLimitResponse = await checkRateLimit(req, "studio-claude");
    if (rateLimitResponse) return rateLimitResponse;
  }
  const budgetResponse = await checkNarratorBudget(req, "studio-claude");
  if (budgetResponse) return budgetResponse;
  if (!ANTHROPIC_API_KEY) return json({ error: "Anthropic API key not configured" }, 500);

  try {
    const body = await req.json();
    const { system, prompt, schema, maxTokens } = body;
    // A subscriber drafts with Sonnet whatever the client asked for; the admin's
    // request names its own allow-listed model.
    const model = access.kind === "plus" ? STUDIO_PLUS_MODEL : (body.model ?? DEFAULT_MODEL);
    const tokenCap = access.kind === "plus" ? STUDIO_PLUS_MAX_TOKENS : MAX_TOKENS;
    if (
      typeof system !== "string" ||
      typeof prompt !== "string" ||
      !schema ||
      typeof schema !== "object" ||
      system.length + prompt.length > MAX_PROMPT_CHARS ||
      !MODELS.has(model)
    ) {
      return json({ error: "invalid_request" }, 400);
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(Number(maxTokens) || 4000, tokenCap),
        system,
        output_config: { format: { type: "json_schema", schema: closed(schema) } },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      return json({ error: "anthropic_error", status: response.status, details: (await response.text()).slice(0, 500) }, 502);
    }

    const data = await response.json();
    if (data.usage) {
      logUsage("anthropic", "studio-claude", { tokensIn: data.usage.input_tokens, tokensOut: data.usage.output_tokens, model });
    }
    if (data.stop_reason === "max_tokens") return json({ error: "truncated" }, 502);
    const text = data.content?.find((b: { type: string }) => b.type === "text")?.text;
    if (!text) return json({ error: "empty_reply" }, 502);
    return json({ result: JSON.parse(text), usage: data.usage ?? null });
  } catch (err) {
    return json({ error: "internal", message: String(err) }, 500);
  }
});
