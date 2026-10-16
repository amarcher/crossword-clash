import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { studioAllowed } from "../_shared/studioAuth.ts";

/**
 * Puzzle insights for the studio's admin panel. Gated by studioAllowed (the
 * STUDIO_TOKEN secret or a signed-in studio admin), like studio-schedule;
 * reads with the service role through two SECURITY DEFINER aggregates that
 * anon and authenticated roles cannot call (so play_sessions and
 * narrator_sessions stay write-only for players).
 *
 *   { action: "puzzles", from: ISO, to: ISO }                    → { puzzles: [...] }
 *   { action: "clues", puzzleKey, from: ISO, to: ISO }           → { clues: [...] }
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_RANGE_MS = 400 * 86_400_000;

function window(body: { from?: unknown; to?: unknown }): { from: string; to: string } | null {
  const from = typeof body.from === "string" ? Date.parse(body.from) : NaN;
  const to = typeof body.to === "string" ? Date.parse(body.to) : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_RANGE_MS) return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await studioAllowed(req))) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json();
    const range = window(body);
    if (!range) return json({ error: "invalid_request" }, 400);
    if (body.action === "puzzles") {
      const { data, error } = await supabase.rpc("insights_puzzles", { p_from: range.from, p_to: range.to });
      if (error) return json({ error: "db_error", message: error.message }, 500);
      return json({ puzzles: data ?? [] });
    }
    if (body.action === "clues") {
      const key = typeof body.puzzleKey === "string" ? body.puzzleKey.slice(0, 200) : "";
      if (!key) return json({ error: "invalid_request" }, 400);
      const { data, error } = await supabase.rpc("insights_clues", { p_puzzle_key: key, p_from: range.from, p_to: range.to });
      if (error) return json({ error: "db_error", message: error.message }, 500);
      return json({ clues: data ?? [] });
    }
    return json({ error: "invalid_request" }, 400);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
});
