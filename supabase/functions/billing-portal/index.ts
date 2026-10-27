import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userFromRequest } from "../_shared/user.ts";
import { entitlementsFor } from "../_shared/entitlementStore.ts";

/**
 * Opens Stripe's Customer Portal for the account's web subscription (cancel,
 * change plan, update the card, download invoices).
 *
 *   POST { returnTo?: "/menu" } with the account's access token → { url }.
 *
 * 404 when the account has never subscribed through Stripe (an app purchase
 * is managed in the store's own settings). Secrets: STRIPE_SECRET_KEY,
 * SITE_URL, and STRIPE_PORTAL_CONFIG (optional): the id of the Plus portal
 * configuration made by `pnpm stripe:portal-config`. The Stripe account is
 * shared with other products, so the account's default portal carries their
 * legal links and plan-switch list; this configuration carries ours and lets
 * a subscriber switch only between the two Plus prices. Unset, the session
 * uses the account default.
 */
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_PORTAL_CONFIG = Deno.env.get("STRIPE_PORTAL_CONFIG") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://crosswordclash.com").replace(/\/+$/, "");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function safeReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/[A-Za-z0-9_\-/]*$/.test(value) ? value : "/menu";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!STRIPE_SECRET_KEY) return json({ error: "not_configured" }, 503);

  const admin = serviceClient();
  const user = await userFromRequest(req, admin);
  if (!user || user.is_anonymous) return json({ error: "unauthorized" }, 401);

  let body: { returnTo?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const customer = (await entitlementsFor(admin, user.id, "stripe")).find((r) => r.external_customer)?.external_customer;
    if (!customer) return json({ error: "no_stripe_customer" }, 404);
    const params = new URLSearchParams({ customer, return_url: `${SITE_URL}${safeReturnPath(body.returnTo)}` });
    if (STRIPE_PORTAL_CONFIG) params.set("configuration", STRIPE_PORTAL_CONFIG);
    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!res.ok) return json({ error: "stripe_error", status: res.status, details: (await res.text()).slice(0, 300) }, 502);
    const session = (await res.json()) as { url?: string };
    if (!session.url) return json({ error: "stripe_error", details: "no url" }, 502);
    return json({ url: session.url });
  } catch (err) {
    return json({ error: "internal", message: String(err) }, 500);
  }
});
