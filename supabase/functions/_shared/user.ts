import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Who is calling an edge function, read from `Authorization: Bearer <access
 * token>` with the service role (so an anon key, an expired token or a forged
 * one all come back null). Anonymous users are real users here: an app
 * purchase can attach to one, so callers decide what `is_anonymous` means for
 * them.
 */
export interface CallerUser {
  id: string;
  is_anonymous: boolean;
  email: string | null;
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export function bearerToken(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

export async function userFromRequest(req: Request, admin: SupabaseClient = serviceClient()): Promise<CallerUser | null> {
  const jwt = bearerToken(req);
  if (!jwt) return null;
  // The anon key is itself a JWT, but it names no user; getUser rejects it.
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  return { id: data.user.id, is_anonymous: !!data.user.is_anonymous, email: data.user.email ?? null };
}
