import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sameToken } from "./purchaseEvents.ts";
import { hasEntitlement, plusGatesOn } from "./plusAccess.ts";
import { serviceClient, userFromRequest } from "./user.ts";

/**
 * Who may use the studio's edge functions (docs/monetization-spec.md §2.2):
 *
 *   admin  a request carrying the STUDIO_TOKEN secret (x-studio-token), or one
 *          signed in (Authorization: Bearer <access token>) as a non-anonymous
 *          user listed in studio_admins. Everything, Opus included.
 *   plus   a non-anonymous user with an in-force Plus entitlement (only once
 *          PLUS_GATES is on). Claude drafting on a per-user allowance, Sonnet
 *          only; never the daily queue or insights.
 *   null   nobody.
 */
const STUDIO_TOKEN = Deno.env.get("STUDIO_TOKEN");

export type StudioAccess = { kind: "admin"; userId: string | null } | { kind: "plus"; userId: string } | null;

export async function studioAccess(req: Request, admin: SupabaseClient = serviceClient()): Promise<StudioAccess> {
  const token = req.headers.get("x-studio-token") ?? "";
  if (STUDIO_TOKEN && token && sameToken(token, STUDIO_TOKEN)) return { kind: "admin", userId: null };

  // The anon key and anonymous users' tokens fail one of these.
  const user = await userFromRequest(req, admin);
  if (!user || user.is_anonymous) return null;
  const { data: row } = await admin.from("studio_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (row) return { kind: "admin", userId: user.id };
  if (plusGatesOn() && (await hasEntitlement(admin, user.id))) return { kind: "plus", userId: user.id };
  return null;
}

/** Admin only: the daily queue, insights and anything else that is the constructor's. */
export async function studioAllowed(req: Request): Promise<boolean> {
  return (await studioAccess(req))?.kind === "admin";
}
