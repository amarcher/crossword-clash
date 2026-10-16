import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Who may use the studio's edge functions: a request carrying the STUDIO_TOKEN
 * secret (x-studio-token), or one signed in (Authorization: Bearer <access
 * token>) as a non-anonymous user listed in studio_admins.
 */
const STUDIO_TOKEN = Deno.env.get("STUDIO_TOKEN");

/** Length-independent comparison, so the token can't be guessed a character at a time. */
function sameToken(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function studioAllowed(req: Request): Promise<boolean> {
  const token = req.headers.get("x-studio-token") ?? "";
  if (STUDIO_TOKEN && token && sameToken(token, STUDIO_TOKEN)) return true;

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // The anon key and anonymous users' tokens fail one of these.
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user || data.user.is_anonymous) return false;
  const { data: row } = await admin.from("studio_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!row;
}
