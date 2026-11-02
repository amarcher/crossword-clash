import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userFromRequest } from "../_shared/user.ts";
import { entitlementsFor, recordEventOnce, transferEntitlements, upsertEntitlement } from "../_shared/entitlementStore.ts";
import {
  pickStripeSubscription,
  revenueCatAction,
  revenueCatSubscriberRow,
  sameToken,
  stripeAction,
  stripeHeaders,
  stripeReconcilePlan,
  stripeStatusToEntitlement,
  stripeSubscriptionRow,
  verifyStripeSignature,
  type RevenueCatEvent,
  type RevenueCatSubscriber,
  type StripeEventLike,
  type StripeSubscriptionLike,
} from "../_shared/purchaseEvents.ts";

/**
 * verify-purchase: the one place entitlements are written
 * (docs/monetization-spec.md §3.2). Three routes, chosen by the path's last
 * segment:
 *
 *   POST …/verify-purchase/revenuecat   RevenueCat webhook. `Authorization`
 *                                       must equal REVENUECAT_WEBHOOK_SECRET
 *                                       (the header value set in its dashboard).
 *   POST …/verify-purchase/stripe       Stripe webhook. `Stripe-Signature`
 *                                       verified against STRIPE_WEBHOOK_SECRET.
 *   POST …/verify-purchase/reconcile    { source: "revenuecat" | "stripe" }
 *                                       from the app with the user's access
 *                                       token: re-reads the vendor's view of
 *                                       this user (Restore purchases, "I just
 *                                       paid, refresh") and answers the rows.
 *
 * Webhooks arrive without a Supabase JWT, so deploy this function with the
 * gateway's JWT check off: `npx supabase functions deploy verify-purchase
 * --no-verify-jwt …`. The reconcile route checks the user itself.
 *
 * Every webhook event is recorded in purchase_events first; a repeat delivery
 * answers 200 and changes nothing. Both vendors retry on non-2xx, so a
 * genuine failure (database down) answers 500 and is retried, while anything
 * we chose to ignore answers 200.
 *
 * Secrets: REVENUECAT_WEBHOOK_SECRET, REVENUECAT_SECRET_KEY (the REST API
 * secret, for reconcile), STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET; optional
 * REVENUECAT_ALLOW_SANDBOX=1 for a staging project.
 */
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
const REVENUECAT_SECRET_KEY = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";
const REVENUECAT_ALLOW_SANDBOX = Deno.env.get("REVENUECAT_ALLOW_SANDBOX") === "1";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function route(req: Request): string {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  return path.slice(path.lastIndexOf("/") + 1);
}

// ---------------------------------------------------------------------------
// RevenueCat
// ---------------------------------------------------------------------------

async function handleRevenueCat(req: Request): Promise<Response> {
  if (!REVENUECAT_WEBHOOK_SECRET) return json({ error: "not_configured" }, 503);
  if (!sameToken(req.headers.get("authorization") ?? "", REVENUECAT_WEBHOOK_SECRET)) return json({ error: "unauthorized" }, 401);

  let body: { event?: RevenueCatEvent };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const event = body.event;
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") return json({ error: "invalid_event" }, 400);

  const action = revenueCatAction(event, { allowSandbox: REVENUECAT_ALLOW_SANDBOX });
  const admin = serviceClient();
  const userId = action.kind === "upsert" ? action.row.user_id : action.kind === "transfer" ? action.to[0] : null;
  const fresh = await recordEventOnce(admin, { source: "revenuecat", eventId: event.id, userId, kind: event.type, payload: body });
  if (!fresh) return json({ ok: true, duplicate: true });

  if (action.kind === "upsert") await upsertEntitlement(admin, action.row);
  else if (action.kind === "transfer") await transferEntitlements(admin, action.from, action.to);
  return json({ ok: true, action: action.kind, ...(action.kind === "ignore" ? { reason: action.reason } : {}) });
}

async function fetchRevenueCatSubscriber(appUserId: string): Promise<RevenueCatSubscriber | null> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${REVENUECAT_SECRET_KEY}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { subscriber?: RevenueCatSubscriber };
  return data.subscriber ?? null;
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

async function stripeGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { headers: stripeHeaders(STRIPE_SECRET_KEY) });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** Like stripeGet, but a 404 (the object no longer exists) is null rather than an error. */
async function stripeGetOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { headers: stripeHeaders(STRIPE_SECRET_KEY) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

async function handleStripe(req: Request): Promise<Response> {
  if (!STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) return json({ error: "not_configured" }, 503);
  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get("stripe-signature"), STRIPE_WEBHOOK_SECRET))) {
    return json({ error: "bad_signature" }, 401);
  }
  let event: StripeEventLike;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (typeof event.id !== "string" || typeof event.type !== "string") return json({ error: "invalid_event" }, 400);

  const action = stripeAction(event);
  const admin = serviceClient();
  const userId = action.kind === "ignore" ? null : action.kind === "upsert" ? action.row.user_id : action.userId;
  const fresh = await recordEventOnce(admin, { source: "stripe", eventId: event.id, userId, kind: event.type, payload: event });
  if (!fresh) return json({ ok: true, duplicate: true });

  if (action.kind === "upsert") {
    await upsertEntitlement(admin, action.row);
  } else if (action.kind === "fetch_subscription") {
    const sub = await stripeGet<StripeSubscriptionLike>(`/subscriptions/${encodeURIComponent(action.subscriptionId)}`);
    const row = stripeSubscriptionRow(sub, action.userId);
    if (row) await upsertEntitlement(admin, row);
  }
  return json({ ok: true, action: action.kind, ...(action.kind === "ignore" ? { reason: action.reason } : {}) });
}

async function searchStripeSubscriptions(userId: string): Promise<StripeSubscriptionLike[]> {
  const query = encodeURIComponent(`metadata['uid']:'${userId}'`);
  const data = await stripeGet<{ data: StripeSubscriptionLike[] }>(`/subscriptions/search?query=${query}&limit=20`);
  return data.data ?? [];
}

// ---------------------------------------------------------------------------
// Reconcile (the app, with the user's token)
// ---------------------------------------------------------------------------

async function handleReconcile(req: Request): Promise<Response> {
  const admin = serviceClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);
  let body: { source?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.source === "revenuecat") {
    if (!REVENUECAT_SECRET_KEY) return json({ error: "not_configured" }, 503);
    const subscriber = await fetchRevenueCatSubscriber(user.id);
    const row = subscriber ? revenueCatSubscriberRow(subscriber, user.id, new Date()) : null;
    if (row) await upsertEntitlement(admin, row);
    else await expireStale(admin, user.id, "revenuecat");
  } else if (body.source === "stripe") {
    if (!STRIPE_SECRET_KEY) return json({ error: "not_configured" }, 503);
    // Stripe needs an account (an email for receipts); an anonymous user has nothing to reconcile.
    if (!user.is_anonymous) {
      // A subscription we already know is re-read by id (strongly consistent);
      // Search is eventually consistent and can miss one made seconds ago, so an
      // empty search never expires anything (see stripeReconcilePlan).
      const plan = stripeReconcilePlan(await entitlementsFor(admin, user.id, "stripe"));
      let sub: StripeSubscriptionLike | null = null;
      let gone = false;
      if (plan.kind === "fetch") {
        sub = await stripeGetOrNull<StripeSubscriptionLike>(`/subscriptions/${encodeURIComponent(plan.subscriptionId)}`);
        gone = sub === null;
        // A lapsed subscription may have been replaced by a newer one that Search has indexed by now.
        if (!sub || stripeStatusToEntitlement(sub.status) === "expired") {
          sub = pickStripeSubscription([...(sub ? [sub] : []), ...(await searchStripeSubscriptions(user.id))]);
        }
      } else {
        sub = pickStripeSubscription(await searchStripeSubscriptions(user.id));
      }
      const row = sub ? stripeSubscriptionRow(sub, user.id) : null;
      // A search (no Stripe row of ours) that only turns up a lapsed subscription writes nothing:
      // there is no Stripe row to expire, and the user's row may be a grant or a store purchase.
      if (row && (plan.kind === "fetch" || row.status !== "expired")) await upsertEntitlement(admin, row);
      else if (gone) await expireStale(admin, user.id, "stripe"); // Stripe no longer has the subscription we recorded
    }
  } else {
    return json({ error: "invalid_source" }, 400);
  }

  return json({ entitlements: await entitlementsFor(admin, user.id) });
}

/** The vendor no longer knows this user: an active row from it is stale. */
async function expireStale(admin: ReturnType<typeof serviceClient>, userId: string, source: string): Promise<void> {
  const { error } = await admin
    .from("entitlements")
    .update({ status: "expired", will_renew: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("source", source)
    .in("status", ["active", "grace"]);
  if (error) throw new Error(`entitlements expire failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    switch (route(req)) {
      case "revenuecat":
        return await handleRevenueCat(req);
      case "stripe":
        return await handleStripe(req);
      case "reconcile":
        return await handleReconcile(req);
      default:
        return json({ error: "not_found" }, 404);
    }
  } catch (err) {
    console.error("[verify-purchase]", err);
    return json({ error: "internal", message: String(err) }, 500);
  }
});
