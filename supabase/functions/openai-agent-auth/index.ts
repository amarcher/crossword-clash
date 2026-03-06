import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const ELEVENLABS_GATE_TOKEN = Deno.env.get("ELEVENLABS_GATE_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = req.headers.get("x-gate-token");

  if (!ELEVENLABS_GATE_TOKEN || token !== ELEVENLABS_GATE_TOKEN) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OpenAI API key not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errorText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify({ token: data.client_secret?.value ?? data.value }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
