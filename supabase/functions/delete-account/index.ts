import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userFromRequest } from "../_shared/user.ts";
import { entitlementsFor } from "../_shared/entitlementStore.ts";
import { stripeHeaders } from "../_shared/purchaseEvents.ts";

/**
 * Deletes the signed-in account (Authorization: Bearer <access token>).
 * Tables that reference auth.users (profiles, solves, studio_admins,
 * entitlements, feature_usage) cascade with the user; the older ones only
 * store the id, so their rows go first; purchase_events keeps its rows with
 * user_id set null (the billing record outlives the account).
 *
 * Billing is cancelled BEFORE the user is deleted, or the person would keep
 * being charged for an account that no longer exists: a Stripe subscription
 * is cancelled at once, and the RevenueCat customer is deleted (the store
 * subscription itself can only be cancelled by the user in the store's own
 * settings, which the app's "Manage subscription" points at; deleting the
 * customer stops RevenueCat from re-granting Plus to a new anonymous id).
 * A vendor error aborts the deletion with 502 so nothing is half done.
 *
 *   POST {} → { ok: true }
 */
const OWNED_TABLES = ["play_sessions", "narrator_sessions", "daily_results", "players"];
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const REVENUECAT_SECRET_KEY = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function cancelStripe(subscriptionId: string): Promise<void> {
  if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: stripeHeaders(STRIPE_SECRET_KEY),
  });
  // 404: already gone (cancelled earlier through the portal); nothing to do.
  if (!res.ok && res.status !== 404) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function deleteRevenueCatCustomer(appUserId: string): Promise<void> {
  if (!REVENUECAT_SECRET_KEY) throw new Error("REVENUECAT_SECRET_KEY is not set");
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${REVENUECAT_SECRET_KEY}` },
  });
  // RevenueCat: treat 200 and 404 both as "ensured deleted".
  if (!res.ok && res.status !== 404) throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = serviceClient();
  const user = await userFromRequest(req, admin);
  // Anonymous players have no account to delete.
  if (!user || user.is_anonymous) return json({ error: "unauthorized" }, 401);
  const userId = user.id;

  // Billing first (see above).
  try {
    const rows = await entitlementsFor(admin, userId);
    for (const row of rows) {
      const live = row.status === "active" || row.status === "grace";
      if (row.source === "stripe" && live && row.external_id) await cancelStripe(row.external_id);
      if (row.source === "revenuecat") await deleteRevenueCatCustomer(row.external_customer ?? userId);
    }
  } catch (err) {
    return json({ error: "billing_error", message: String(err) }, 502);
  }

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
