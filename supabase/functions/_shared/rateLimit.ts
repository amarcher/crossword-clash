import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const LIMITS: Record<string, RateLimitConfig> = {
  "agent-auth": { windowMs: 3_600_000, maxRequests: 3 },
  "openai-agent-auth": { windowMs: 3_600_000, maxRequests: 3 },
  "narrator-claude": { windowMs: 3_600_000, maxRequests: 60 },
  tts: { windowMs: 3_600_000, maxRequests: 30 },
};

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Check rate limit for an endpoint. Returns a 429 Response if over limit,
 * or null if the request should proceed.
 */
export async function checkRateLimit(
  req: Request,
  endpoint: string,
): Promise<Response | null> {
  const config = LIMITS[endpoint];
  if (!config) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null; // Skip if not configured

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const clientIp = getClientIp(req);
  const windowStart = new Date(Date.now() - config.windowMs).toISOString();

  // Count requests in the current window
  const { count, error: countError } = await supabase
    .from("narrator_usage")
    .select("*", { count: "exact", head: true })
    .eq("client_ip", clientIp)
    .eq("endpoint", endpoint)
    .gte("created_at", windowStart);

  if (countError) {
    console.error("Rate limit check failed:", countError);
    return null; // Fail open — don't block on rate limit errors
  }

  if ((count ?? 0) >= config.maxRequests) {
    const retryAfterMs = config.windowMs;
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: `Rate limit exceeded. Try again later.`,
        retryAfterMs,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
        },
      },
    );
  }

  // Record this request
  const { error: insertError } = await supabase
    .from("narrator_usage")
    .insert({ client_ip: clientIp, endpoint });

  if (insertError) {
    console.error("Rate limit insert failed:", insertError);
  }

  return null;
}
