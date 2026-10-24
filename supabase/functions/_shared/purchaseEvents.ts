/**
 * Purchase events → entitlement rows: Deno MIRROR of src/lib/purchaseEvents.ts.
 *
 * Edge functions run under Deno and are not covered by `tsc -b` or vitest, so
 * the authoritative, tested copy lives in src/lib/purchaseEvents.ts. Everything
 * between the MIRROR markers must stay byte-for-byte identical to that file's
 * block; src/lib/purchaseEvents.test.ts fails when it is not. Edit the src
 * copy, then paste the block here.
 */

// --- MIRROR START ---
export type EntitlementProduct = "plus" | "supporter";
export type EntitlementSource = "revenuecat" | "stripe" | "apple" | "google" | "grant";
export type EntitlementStatus = "active" | "grace" | "expired" | "revoked";

/** The columns verify-purchase writes for one (user, product). */
export interface EntitlementUpsert {
  user_id: string;
  product: EntitlementProduct;
  source: EntitlementSource;
  status: EntitlementStatus;
  /** ISO timestamp, or null for an entitlement that never expires. */
  expires_at: string | null;
  will_renew: boolean;
  /** The store purchase key a restore on another device presents. */
  external_id: string | null;
  /** Stripe customer id or RevenueCat app_user_id, for the portal and for cancelling on account deletion. */
  external_customer: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether an id is a Supabase user id (a UUID), as opposed to a RevenueCat anonymous id or anything else. */
export function isSupabaseUid(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/** Length-independent string comparison for shared secrets (same as studioAuth's sameToken). */
export function sameToken(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function isoFromMs(ms: unknown): string | null {
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

// ---------------------------------------------------------------------------
// RevenueCat
// ---------------------------------------------------------------------------

/** The RevenueCat entitlement identifier that means Plus (configured in its dashboard). */
export const REVENUECAT_PLUS_ENTITLEMENT = "plus";

/** The fields of a RevenueCat webhook `event` this module reads (the payload has many more). */
export interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  cancel_reason?: string;
  environment?: string;
  transferred_from?: string[];
  transferred_to?: string[];
}

export type RevenueCatAction =
  | { kind: "upsert"; row: EntitlementUpsert }
  /** A store account moved between app users: move every revenuecat row from → to. */
  | { kind: "transfer"; from: string[]; to: string[] }
  | { kind: "ignore"; reason: string };

/**
 * The Supabase user a RevenueCat event is about: `app_user_id` when the app set
 * it to the Supabase uid (it always does), else the first alias that is one
 * (a device that reinstalled and purchased before `logIn` ran). RevenueCat's
 * own anonymous ids (`$RCAnonymousID:…`) are never a user of ours.
 */
export function revenueCatUserId(event: Pick<RevenueCatEvent, "app_user_id" | "aliases">): string | null {
  if (isSupabaseUid(event.app_user_id)) return event.app_user_id;
  return event.aliases?.find(isSupabaseUid) ?? null;
}

/**
 * What to do with one RevenueCat webhook event. Event types and the status
 * they mean (RevenueCat "Event types and fields", read 2026-10-23):
 * INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE /
 * SUBSCRIPTION_EXTENDED → active; NON_RENEWING_PURCHASE → active, no renewal;
 * CANCELLATION → still active until `expiration_at_ms` but not renewing,
 * except a customer-support cancellation (a refund) → revoked;
 * SUBSCRIPTION_PAUSED → active until expiry, not renewing; BILLING_ISSUE →
 * grace until the grace period ends; EXPIRATION → expired; TRANSFER → move
 * rows. TEST, invoice and virtual-currency events are ignored, as is any
 * event about another entitlement. Sandbox events are ignored unless
 * `allowSandbox`, so a tester's sandbox purchase never grants production Plus.
 */
export function revenueCatAction(event: RevenueCatEvent, opts: { allowSandbox?: boolean } = {}): RevenueCatAction {
  const type = event.type ?? "";
  if (type === "TEST") return { kind: "ignore", reason: "test_event" };
  if (event.environment === "SANDBOX" && !opts.allowSandbox) return { kind: "ignore", reason: "sandbox" };

  if (type === "TRANSFER") {
    const from = (event.transferred_from ?? []).filter(isSupabaseUid);
    const to = (event.transferred_to ?? []).filter(isSupabaseUid);
    if (from.length === 0 || to.length === 0) return { kind: "ignore", reason: "transfer_without_supabase_users" };
    return { kind: "transfer", from, to };
  }

  const ids = event.entitlement_ids;
  if (Array.isArray(ids) && ids.length > 0 && !ids.includes(REVENUECAT_PLUS_ENTITLEMENT)) {
    return { kind: "ignore", reason: "other_entitlement" };
  }
  const userId = revenueCatUserId(event);
  if (!userId) return { kind: "ignore", reason: "anonymous_app_user_id" };

  let status: EntitlementStatus;
  let willRenew: boolean;
  let expiresAt = isoFromMs(event.expiration_at_ms);
  switch (type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
    case "TEMPORARY_ENTITLEMENT_GRANT":
      status = "active";
      willRenew = type !== "TEMPORARY_ENTITLEMENT_GRANT";
      break;
    case "NON_RENEWING_PURCHASE":
      status = "active";
      willRenew = false;
      break;
    case "CANCELLATION":
      if (event.cancel_reason === "CUSTOMER_SUPPORT") {
        status = "revoked";
        willRenew = false;
      } else {
        status = "active";
        willRenew = false;
      }
      break;
    case "SUBSCRIPTION_PAUSED":
      status = "active";
      willRenew = false;
      break;
    case "BILLING_ISSUE":
      status = "grace";
      willRenew = true;
      expiresAt = isoFromMs(event.grace_period_expiration_at_ms) ?? expiresAt;
      break;
    case "EXPIRATION":
      status = "expired";
      willRenew = false;
      break;
    default:
      return { kind: "ignore", reason: `unhandled_type:${type || "none"}` };
  }

  // A subscription must carry an expiry; without one, "active" would mean
  // for ever (has_entitlement treats NULL as lifetime), so refuse the event
  // rather than over-grant. Expired and revoked rows need none.
  if (!expiresAt && (status === "active" || status === "grace")) return { kind: "ignore", reason: "active_without_expiry" };

  return {
    kind: "upsert",
    row: {
      user_id: userId,
      product: "plus",
      source: "revenuecat",
      status,
      expires_at: expiresAt,
      will_renew: willRenew,
      external_id: event.original_transaction_id ?? event.transaction_id ?? null,
      external_customer: event.original_app_user_id ?? event.app_user_id ?? null,
    },
  };
}

/** The parts of `GET /v1/subscribers/{id}` this module reads (the "Restore purchases" path). */
export interface RevenueCatSubscriber {
  original_app_user_id?: string;
  entitlements?: Record<
    string,
    { expires_date: string | null; grace_period_expires_date?: string | null; product_identifier?: string; purchase_date?: string }
  >;
  subscriptions?: Record<
    string,
    {
      expires_date?: string | null;
      grace_period_expires_date?: string | null;
      unsubscribe_detected_at?: string | null;
      billing_issues_detected_at?: string | null;
      refunded_at?: string | null;
      store_transaction_id?: string | number | null;
      store?: string;
    }
  >;
}

/**
 * The Plus row a RevenueCat subscriber record implies for `userId`, or null
 * when the subscriber has never held Plus. A lapsed entitlement comes back
 * as `expired` (not null) so a stale active row gets corrected.
 */
export function revenueCatSubscriberRow(subscriber: RevenueCatSubscriber, userId: string, now: Date): EntitlementUpsert | null {
  const ent = subscriber.entitlements?.[REVENUECAT_PLUS_ENTITLEMENT];
  if (!ent) return null;
  const sub = ent.product_identifier ? subscriber.subscriptions?.[ent.product_identifier] : undefined;
  const expiresAt = ent.expires_date ?? sub?.expires_date ?? null;
  const graceUntil = ent.grace_period_expires_date ?? sub?.grace_period_expires_date ?? null;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const graceMs = graceUntil ? Date.parse(graceUntil) : NaN;
  const nowMs = now.getTime();

  let status: EntitlementStatus;
  let willRenew = !sub?.unsubscribe_detected_at;
  let effectiveExpiry = expiresAt;
  if (sub?.refunded_at) {
    status = "revoked";
    willRenew = false;
  } else if (Number.isFinite(graceMs) && graceMs > nowMs && sub?.billing_issues_detected_at) {
    status = "grace";
    effectiveExpiry = graceUntil;
  } else if (expiresAt === null || (Number.isFinite(expiresMs) && expiresMs > nowMs)) {
    status = "active";
  } else {
    status = "expired";
    willRenew = false;
  }
  // A subscription entitlement always has an expiry; null here would be a
  // lifetime (non-subscription) purchase, which Plus is not sold as.
  if (effectiveExpiry === null && status === "active") return null;

  return {
    user_id: userId,
    product: "plus",
    source: "revenuecat",
    status,
    expires_at: effectiveExpiry,
    will_renew: willRenew,
    external_id: sub?.store_transaction_id != null ? String(sub.store_transaction_id) : null,
    external_customer: subscriber.original_app_user_id ?? userId,
  };
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

/** The fields of a Stripe Subscription this module reads. */
export interface StripeSubscriptionLike {
  id: string;
  status: string;
  customer?: string | { id: string } | null;
  /** API versions before 2025-03-31 carry the period on the subscription… */
  current_period_end?: number | null;
  /** …later ones on each item. */
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
  cancel_at_period_end?: boolean | null;
  metadata?: Record<string, string> | null;
}

/**
 * Stripe subscription status → ours. `trialing` counts as active (no trial is
 * sold, but a goodwill trial from the dashboard should work); `past_due` is
 * Stripe's own retry window; everything else is not entitled.
 */
export function stripeStatusToEntitlement(status: string): EntitlementStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "grace";
    default:
      // canceled, unpaid, incomplete, incomplete_expired, paused
      return "expired";
  }
}

export function stripeCustomerId(sub: Pick<StripeSubscriptionLike, "customer">): string | null {
  const c = sub.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

/** The current period's end as ISO, from whichever place this API version puts it. */
export function stripePeriodEnd(sub: Pick<StripeSubscriptionLike, "current_period_end" | "items">): string | null {
  const seconds = sub.current_period_end ?? sub.items?.data?.map((i) => i.current_period_end).find((s) => typeof s === "number") ?? null;
  return typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * The Plus row a Stripe subscription means for `userId`. A past_due
 * subscription keeps its period end as the expiry: Stripe's retry schedule
 * decides what happens next and sends another `customer.subscription.updated`.
 */
export function stripeSubscriptionRow(sub: StripeSubscriptionLike, userId: string): EntitlementUpsert | null {
  const status = stripeStatusToEntitlement(sub.status);
  const expiresAt = stripePeriodEnd(sub);
  if (!expiresAt && (status === "active" || status === "grace")) return null;
  return {
    user_id: userId,
    product: "plus",
    source: "stripe",
    status,
    expires_at: expiresAt,
    will_renew: status !== "expired" && !sub.cancel_at_period_end,
    external_id: sub.id,
    external_customer: stripeCustomerId(sub),
  };
}

/** The fields of a Stripe Event this module reads. */
export interface StripeEventLike {
  id?: string;
  type?: string;
  livemode?: boolean;
  data?: { object?: Record<string, unknown> };
}

export type StripeAction =
  | { kind: "upsert"; row: EntitlementUpsert }
  /** The event names a subscription but not its state: fetch it and upsert from the answer. */
  | { kind: "fetch_subscription"; subscriptionId: string; userId: string }
  | { kind: "ignore"; reason: string };

/**
 * What to do with one Stripe event. Subscription lifecycle events carry the
 * subscription, whose `metadata.uid` (set by create-checkout through
 * `subscription_data.metadata`) names the user; `checkout.session.completed`
 * names the user in `client_reference_id` and the subscription by id only, so
 * it asks the caller to fetch it (and never writes "active for ever" on a
 * session alone). Invoice events are ignored because Stripe moves the
 * subscription to `past_due` / back to `active` itself and sends
 * `customer.subscription.updated` for each; refunds are handled by cancelling
 * the subscription in the dashboard, which arrives as `…deleted`.
 */
export function stripeAction(event: StripeEventLike): StripeAction {
  const type = event.type ?? "";
  const object = event.data?.object ?? {};
  if (type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const sub = object as unknown as StripeSubscriptionLike;
    const userId = sub.metadata?.uid;
    if (!isSupabaseUid(userId)) return { kind: "ignore", reason: "subscription_without_uid" };
    const row = stripeSubscriptionRow(type === "customer.subscription.deleted" ? { ...sub, status: "canceled" } : sub, userId);
    return row ? { kind: "upsert", row } : { kind: "ignore", reason: "active_without_period_end" };
  }
  if (type === "checkout.session.completed") {
    const session = object as { mode?: string; client_reference_id?: string | null; subscription?: string | { id: string } | null };
    if (session.mode !== "subscription") return { kind: "ignore", reason: "not_a_subscription_checkout" };
    const userId = session.client_reference_id;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!isSupabaseUid(userId) || !subscriptionId) return { kind: "ignore", reason: "checkout_without_uid_or_subscription" };
    return { kind: "fetch_subscription", subscriptionId, userId };
  }
  return { kind: "ignore", reason: `unhandled_type:${type || "none"}` };
}

/**
 * Picks the subscription that decides a user's Plus from a list (the
 * reconcile path, `GET /v1/subscriptions/search?query=metadata['uid']:…`):
 * an entitled one if any (latest period end wins), else the most recently
 * ended, so a lapsed subscription corrects a stale active row. Null for a
 * user Stripe has never billed.
 */
export function pickStripeSubscription<T extends StripeSubscriptionLike>(subs: readonly T[]): T | null {
  if (subs.length === 0) return null;
  const end = (s: T) => Date.parse(stripePeriodEnd(s) ?? "") || 0;
  const entitled = subs.filter((s) => stripeStatusToEntitlement(s.status) !== "expired");
  const pool = entitled.length > 0 ? entitled : subs;
  return [...pool].sort((a, b) => end(b) - end(a))[0] ?? null;
}

// --- Stripe webhook signatures (docs.stripe.com/webhooks#verify-manually) ---

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/** `t=1492774577,v1=5257a…,v0=…` → its timestamp and v1 signatures, or null when malformed. */
export function parseStripeSignature(header: string | null | undefined): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a Stripe-Signature header against the raw request body: the
 * HMAC-SHA256 of `${timestamp}.${body}` with the endpoint's signing secret
 * must match one of the header's v1 signatures (constant-time), and the
 * timestamp must be within `toleranceSeconds` of now (replay protection).
 */
export async function verifyStripeSignature(
  body: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): Promise<boolean> {
  const parsed = parseStripeSignature(header);
  if (!parsed || !secret) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${body}`);
  return parsed.signatures.some((sig) => sameToken(sig, expected));
}

/** Builds a Stripe-Signature header the way Stripe does; for tests and local replay. */
export async function signStripePayload(body: string, secret: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}
// --- MIRROR END ---
