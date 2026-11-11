import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userFromRequest } from "../_shared/user.ts";
import { entitlementsFor } from "../_shared/entitlementStore.ts";
import { checkoutOrigin, checkoutTrialDays, stripeHeaders } from "../_shared/purchaseEvents.ts";

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
 * A first subscription starts with a free month (`PLUS_TRIAL_DAYS`): Checkout
 * still takes the card and Stripe charges the plan's price when the trial
 * ends. An account that already has any entitlement row gets no trial, and
 * neither does one whose email Stripe has already held a subscription for
 * (`emailBilledBefore`: an account deleted and made again), so the free month
 * is given once per email. STRIPE_TRIAL_DAYS overrides the length without a
 * deploy of the client; 0 turns the trial off.
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
const TRIAL_DAYS_OVERRIDE = Deno.env.get("STRIPE_TRIAL_DAYS");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Only a same-site path may be a return target. */
function safeReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/[A-Za-z0-9_\-/]*$/.test(value) ? value : "/menu";
}

/**
 * Whether Stripe already holds a subscription, of any status, for a customer
 * with this email. Customers outlive a deleted account, so this is the record
 * of an earlier trial or subscription under the same identity. Throws when
 * Stripe cannot answer: the caller then starts no Checkout, since guessing
 * either way would give a second free month or charge someone promised one.
 */
async function emailBilledBefore(email: string): Promise<boolean> {
  const list = await fetch(`https://api.stripe.com/v1/customers?limit=100&email=${encodeURIComponent(email)}`, {
    headers: stripeHeaders(STRIPE_SECRET_KEY),
  });
  if (!list.ok) throw new Error(`Stripe customers ${list.status}`);
  const customers = ((await list.json()) as { data?: Array<{ id: string }> }).data ?? [];
  for (const customer of customers) {
    const subs = await fetch(`https://api.stripe.com/v1/subscriptions?status=all&limit=1&customer=${encodeURIComponent(customer.id)}`, {
      headers: stripeHeaders(STRIPE_SECRET_KEY),
    });
    if (!subs.ok) throw new Error(`Stripe subscriptions ${subs.status}`);
    if ((((await subs.json()) as { data?: unknown[] }).data ?? []).length > 0) return true;
  }
  return false;
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
    if (AUTOMATIC_TAX) params.set("automatic_tax[enabled]", "true");
    // Reuse the customer from an earlier Stripe subscription, else let Checkout create one for the account's email.
    const held = await entitlementsFor(admin, user.id);
    const override = TRIAL_DAYS_OVERRIDE ? Number(TRIAL_DAYS_OVERRIDE) : NaN;
    const days = Number.isInteger(override) && override >= 0 ? override : undefined;
    // Ask Stripe about the email only when a trial is otherwise due.
    const billedBefore = checkoutTrialDays(held.length, days) > 0 && !!user.email && (await emailBilledBefore(user.email));
    const trialDays = checkoutTrialDays(held.length, days, billedBefore);
    if (trialDays > 0) params.set("subscription_data[trial_period_days]", String(trialDays));
    const previous = held.find((r) => r.source === "stripe" && r.external_customer);
    if (previous?.external_customer) {
      params.set("customer", previous.external_customer);
      // Stripe Tax needs the customer's address; let Checkout save what the buyer enters onto the
      // existing customer. Stripe refuses `customer_update` without a `customer`, so a first-time
      // buyer (no customer yet) must not send it: Checkout collects the address on its own then.
      if (AUTOMATIC_TAX) params.set("customer_update[address]", "auto");
    } else if (user.email) {
      params.set("customer_email", user.email);
    }

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
