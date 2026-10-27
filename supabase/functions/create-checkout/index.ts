import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userFromRequest } from "../_shared/user.ts";
import { entitlementsFor } from "../_shared/entitlementStore.ts";
import { checkoutOrigin, stripeHeaders } from "../_shared/purchaseEvents.ts";

/**
 * Starts a Stripe Checkout session for Crossword Clash Plus on the web
 * (docs/monetization-spec.md §3.2 "companion functions").
 *
 *   POST { plan: "monthly" | "annual", returnTo?: "/archive" } with the
 *   account's access token → { url } to redirect the browser to.
 *
 * Only a real account may subscribe (Stripe needs an email for receipts and
 * the retention sweep would otherwise delete an idle anonymous payer): an
 * anonymous or missing user gets 401. The session is keyed to the user three
 * ways so the webhook can never mis-attribute it: `client_reference_id`, the
 * subscription's `metadata.uid` (what verify-purchase/stripe reads) and the
 * session's own metadata. An existing Stripe customer (from an earlier
 * subscription) is reused so the Customer Portal shows one history.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL
 * (price ids), SITE_URL (default https://crosswordclash.com), optional
 * STRIPE_AUTOMATIC_TAX=1 once Stripe Tax is set up.
 */
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const PRICES: Record<string, string | undefined> = {
  monthly: Deno.env.get("STRIPE_PRICE_MONTHLY"),
  annual: Deno.env.get("STRIPE_PRICE_ANNUAL"),
};
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://crosswordclash.com").replace(/\/+$/, "");
const AUTOMATIC_TAX = Deno.env.get("STRIPE_AUTOMATIC_TAX") === "1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Only a same-site path may be a return target. */
function safeReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/[A-Za-z0-9_\-/]*$/.test(value) ? value : "/menu";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!STRIPE_SECRET_KEY || !PRICES.monthly || !PRICES.annual) return json({ error: "not_configured" }, 503);

  const admin = serviceClient();
  const user = await userFromRequest(req, admin);
  if (!user || user.is_anonymous) return json({ error: "unauthorized" }, 401);

  let body: { plan?: string; returnTo?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const price = body.plan ? PRICES[body.plan] : undefined;
  if (!price) return json({ error: "invalid_plan" }, 400);
  const returnTo = safeReturnPath(body.returnTo);

  try {
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", price);
    params.set("line_items[0][quantity]", "1");
    params.set("client_reference_id", user.id);
    params.set("metadata[uid]", user.id);
    params.set("subscription_data[metadata][uid]", user.id);
    // Back to the site, or to the preview deployment the purchase started on.
    const origin = checkoutOrigin(req.headers.get("origin"), SITE_URL);
    params.set("success_url", `${origin}${returnTo}?checkout=success`);
    params.set("cancel_url", `${origin}${returnTo}?checkout=cancelled`);
    params.set("allow_promotion_codes", "true");
    if (AUTOMATIC_TAX) {
      params.set("automatic_tax[enabled]", "true");
      params.set("customer_update[address]", "auto");
    }
    // Reuse the customer from an earlier Stripe subscription, else let Checkout create one for the account's email.
    const previous = (await entitlementsFor(admin, user.id, "stripe")).find((r) => r.external_customer);
    if (previous?.external_customer) params.set("customer", previous.external_customer);
    else if (user.email) params.set("customer_email", user.email);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: stripeHeaders(STRIPE_SECRET_KEY, true),
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
