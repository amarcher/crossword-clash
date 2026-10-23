import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { checkNarratorBudget } from "../_shared/budgetGuard.ts";
import { logUsage } from "../_shared/usageLog.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// The narrator's model. Sonnet 4 (`claude-sonnet-4-20250514`) is deprecated;
// Sonnet 5.5 is the like-for-like replacement at $2 / $10 per MTok. Keep this
// id in DEFAULT_NARRATOR_PRICING (src/lib/narratorBudget.ts and its Deno
// mirror) so the budget cap prices its ledger rows exactly.
const NARRATOR_MODEL = "claude-sonnet-5-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rateLimitResponse = await checkRateLimit(req, "narrator-claude");
  if (rateLimitResponse) return rateLimitResponse;

  const budgetResponse = await checkNarratorBudget(req, "narrator-claude");
  if (budgetResponse) return budgetResponse;

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Anthropic API key not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const { messages, systemPrompt } = await req.json();

    if (!Array.isArray(messages) || typeof systemPrompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: NARRATOR_MODEL,
        max_tokens: 256,
        // A one-line quip needs no deliberation: `between_tools` is the lowest
        // thinking setting on Sonnet 5.5 (`disabled` is rejected), and it
        // keeps the whole 256-token budget for the reply. Keep effort at or
        // below "high", the ceiling for this setting.
        thinking: { type: "between_tools" },
        output_config: { effort: "low" },
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: "Anthropic API error", details: errorText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    if (data.usage) {
      logUsage("anthropic", "narrator-claude", {
        tokensIn: data.usage.input_tokens,
        tokensOut: data.usage.output_tokens,
        model: NARRATOR_MODEL,
      });
    }
    // Read the reply by block type, not position: a response may carry a
    // `thinking` block (empty under the default display) before the text.
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(data.content) ? data.content : [];
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
