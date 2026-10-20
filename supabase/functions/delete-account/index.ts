import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Deletes the signed-in account (Authorization: Bearer <access token>).
 * Tables that reference auth.users (profiles, solves, studio_admins) cascade
 * with the user; the older ones only store the id, so their rows go first.
 *
 *   POST {} → { ok: true }
 */
const OWNED_TABLES = ["play_sessions", "narrator_sessions", "daily_results", "players"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.auth.getUser(jwt);
  // Anonymous players have no account to delete.
  if (error || !data.user || data.user.is_anonymous) return json({ error: "unauthorized" }, 401);
  const userId = data.user.id;

  for (const table of OWNED_TABLES) {
    const { error: deleteError } = await admin.from(table).delete().eq("user_id", userId);
    if (deleteError) return json({ error: "db_error", message: deleteError.message }, 500);
  }
  const { error: hostError } = await admin.from("games").update({ host_user_id: null }).eq("host_user_id", userId);
  if (hostError) return json({ error: "db_error", message: hostError.message }, 500);

  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) return json({ error: "auth_error", message: userError.message }, 500);
  return json({ ok: true });
});
