import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { checkNarratorBudget } from "../_shared/budgetGuard.ts";
import { logUsage } from "../_shared/usageLog.ts";

/**
 * Claude for the construction studio (/studio): one structured-output call per
 * request (clue drafts, alternatives). The studio builds the prompt with
 * src/lib/seedgrid/cluePrompt.ts; this function only gates and forwards it.
 *
 * Gated three ways: the STUDIO_TOKEN secret (sent as x-studio-token, so only
 * the constructor can spend), the per-IP rate limit, and the shared monthly AI
 * spend cap (402 narrator_unavailable once reached). Models and output size
 * are allowlisted.
 */
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const STUDIO_TOKEN = Deno.env.get("STUDIO_TOKEN");
const MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);
const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;
const MAX_PROMPT_CHARS = 40000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Length-independent comparison, so the token can't be guessed a character at a time. */
function sameToken(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

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

  if (!STUDIO_TOKEN || !sameToken(req.headers.get("x-studio-token") ?? "", STUDIO_TOKEN)) {
    return json({ error: "unauthorized" }, 401);
  }

  const rateLimitResponse = await checkRateLimit(req, "studio-claude");
  if (rateLimitResponse) return rateLimitResponse;
  const budgetResponse = await checkNarratorBudget(req, "studio-claude");
  if (budgetResponse) return budgetResponse;
  if (!ANTHROPIC_API_KEY) return json({ error: "Anthropic API key not configured" }, 500);

  try {
    const { system, prompt, schema, maxTokens, model = DEFAULT_MODEL } = await req.json();
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
        max_tokens: Math.min(Number(maxTokens) || 4000, MAX_TOKENS),
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
