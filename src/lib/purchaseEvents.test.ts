import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STRIPE_API_VERSION,
  checkoutOrigin,
  isSupabaseUid,
  parseStripeSignature,
  pickStripeSubscription,
  revenueCatAction,
  revenueCatSubscriberRow,
  revenueCatUserId,
  sameToken,
  signStripePayload,
  stripeAction,
  stripeHeaders,
  stripePeriodEnd,
  stripeReconcilePlan,
  stripeStatusToEntitlement,
  stripeSubscriptionRow,
  type RevenueCatEvent,
  verifyStripeSignature,
} from "./purchaseEvents";

const UID = "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const OTHER = "0f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const RC_ANON = "$RCAnonymousID:8069238d6049ce87cc529853916d624c";
const NOW = Date.parse("2026-10-24T12:00:00Z");
const LATER_MS = NOW + 30 * 86_400_000;

function rcEvent(over: Partial<RevenueCatEvent>): RevenueCatEvent {
  return {
    id: "evt-1",
    type: "INITIAL_PURCHASE",
    app_user_id: UID,
    original_app_user_id: RC_ANON,
    aliases: [RC_ANON],
    entitlement_ids: ["plus"],
    product_id: "plus_monthly",
    transaction_id: "200000000000002",
    original_transaction_id: "200000000000000",
    expiration_at_ms: LATER_MS,
    environment: "PRODUCTION",
    ...over,
  };
}

describe("stripeHeaders", () => {
  it("pins every raw call to the version the module reads, with the form encoding only for a POST", () => {
    expect(stripeHeaders("sk_test_x")).toEqual({ Authorization: "Bearer sk_test_x", "Stripe-Version": STRIPE_API_VERSION });
    expect(stripeHeaders("sk_test_x", true)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.[a-z]+$/);
  });
});

describe("the Deno mirror", () => {
  it("is byte-for-byte the src module's MIRROR block", () => {
    const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
    const block = (text: string) => text.slice(text.indexOf("// --- MIRROR START ---"), text.indexOf("// --- MIRROR END ---"));
    const src = readFileSync(here("./purchaseEvents.ts"), "utf8");
    const deno = readFileSync(here("../../supabase/functions/_shared/purchaseEvents.ts"), "utf8");
    expect(block(src).length).toBeGreaterThan(1000);
    expect(block(deno)).toBe(block(src));
  });
});

describe("ids and secrets", () => {
  it("knows a Supabase uid from a RevenueCat anonymous id", () => {
    expect(isSupabaseUid(UID)).toBe(true);
    expect(isSupabaseUid(UID.toUpperCase())).toBe(true);
    expect(isSupabaseUid(RC_ANON)).toBe(false);
    expect(isSupabaseUid("user_1234")).toBe(false);
    expect(isSupabaseUid(undefined)).toBe(false);
  });

  it("compares secrets without regard to length", () => {
    expect(sameToken("abc", "abc")).toBe(true);
    expect(sameToken("abc", "abd")).toBe(false);
    expect(sameToken("abc", "abcd")).toBe(false);
    expect(sameToken("", "")).toBe(true);
  });

  it("takes app_user_id when it is a uid, else a uid alias, else nobody", () => {
    expect(revenueCatUserId({ app_user_id: UID, aliases: [RC_ANON] })).toBe(UID);
    expect(revenueCatUserId({ app_user_id: RC_ANON, aliases: [RC_ANON, OTHER] })).toBe(OTHER);
    expect(revenueCatUserId({ app_user_id: RC_ANON, aliases: [RC_ANON] })).toBeNull();
    expect(revenueCatUserId({ app_user_id: RC_ANON })).toBeNull();
  });
});

describe("revenueCatAction", () => {
  it("writes an active, renewing Plus row for a purchase or renewal", () => {
    for (const type of ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED"]) {
      const action = revenueCatAction(rcEvent({ type }));
      expect(action).toEqual({
        kind: "upsert",
        row: {
          user_id: UID,
          product: "plus",
          source: "revenuecat",
          status: "active",
          expires_at: new Date(LATER_MS).toISOString(),
          will_renew: true,
          external_id: "200000000000000",
          external_customer: RC_ANON,
        },
      });
    }
  });

  it("keeps a cancelled subscription active until it expires, but not renewing", () => {
    const action = revenueCatAction(rcEvent({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }));
    expect(action.kind).toBe("upsert");
    if (action.kind !== "upsert") return;
    expect(action.row.status).toBe("active");
    expect(action.row.will_renew).toBe(false);
  });

  it("revokes on a customer-support cancellation (a refund)", () => {
    const action = revenueCatAction(rcEvent({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }));
    expect(action.kind === "upsert" && action.row.status).toBe("revoked");
  });

  it("puts a billing issue in grace until the grace period ends", () => {
    const grace = LATER_MS + 7 * 86_400_000;
    const action = revenueCatAction(rcEvent({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: grace }));
    expect(action.kind === "upsert" && action.row).toMatchObject({ status: "grace", will_renew: true, expires_at: new Date(grace).toISOString() });
    // Without a grace period the subscription's own expiry bounds it.
    const noGrace = revenueCatAction(rcEvent({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: null }));
    expect(noGrace.kind === "upsert" && noGrace.row.expires_at).toBe(new Date(LATER_MS).toISOString());
  });

  it("expires on EXPIRATION, even with no expiry timestamp", () => {
    const action = revenueCatAction(rcEvent({ type: "EXPIRATION", expiration_at_ms: null }));
    expect(action.kind === "upsert" && action.row).toMatchObject({ status: "expired", will_renew: false, expires_at: null });
  });

  it("never writes an active row with no expiry", () => {
    expect(revenueCatAction(rcEvent({ expiration_at_ms: null }))).toEqual({ kind: "ignore", reason: "active_without_expiry" });
  });

  it("maps a TRANSFER to a move between Supabase users, and ignores one between anonymous ids", () => {
    expect(revenueCatAction(rcEvent({ type: "TRANSFER", transferred_from: [OTHER, RC_ANON], transferred_to: [UID] }))).toEqual({
      kind: "transfer",
      from: [OTHER],
      to: [UID],
    });
    expect(revenueCatAction(rcEvent({ type: "TRANSFER", transferred_from: [RC_ANON], transferred_to: [UID] })).kind).toBe("ignore");
  });

  it("ignores test events, other entitlements, anonymous app users and unknown types", () => {
    expect(revenueCatAction(rcEvent({ type: "TEST" }))).toEqual({ kind: "ignore", reason: "test_event" });
    expect(revenueCatAction(rcEvent({ entitlement_ids: ["pro"] }))).toEqual({ kind: "ignore", reason: "other_entitlement" });
    expect(revenueCatAction(rcEvent({ app_user_id: RC_ANON, aliases: [RC_ANON] }))).toEqual({ kind: "ignore", reason: "anonymous_app_user_id" });
    expect(revenueCatAction(rcEvent({ type: "INVOICE_ISSUANCE" }))).toEqual({ kind: "ignore", reason: "unhandled_type:INVOICE_ISSUANCE" });
    // An event with no entitlement list is about our only entitlement.
    expect(revenueCatAction(rcEvent({ entitlement_ids: null })).kind).toBe("upsert");
  });

  it("ignores sandbox purchases unless allowed", () => {
    expect(revenueCatAction(rcEvent({ environment: "SANDBOX" }))).toEqual({ kind: "ignore", reason: "sandbox" });
    expect(revenueCatAction(rcEvent({ environment: "SANDBOX" }), { allowSandbox: true }).kind).toBe("upsert");
  });
});

describe("revenueCatSubscriberRow (restore)", () => {
  const now = new Date(NOW);
  const future = new Date(LATER_MS).toISOString();
  const past = new Date(NOW - 86_400_000).toISOString();

  it("is null for a subscriber who never held Plus", () => {
    expect(revenueCatSubscriberRow({ entitlements: {} }, UID, now)).toBeNull();
    expect(revenueCatSubscriberRow({ entitlements: { pro: { expires_date: future } } }, UID, now)).toBeNull();
  });

  it("reads an active subscription with its store transaction as the purchase key", () => {
    const row = revenueCatSubscriberRow(
      {
        original_app_user_id: RC_ANON,
        entitlements: { plus: { expires_date: future, product_identifier: "plus_monthly" } },
        subscriptions: { plus_monthly: { expires_date: future, store_transaction_id: 1000000652379790, unsubscribe_detected_at: null } },
      },
      UID,
      now,
    );
    expect(row).toEqual({
      user_id: UID,
      product: "plus",
      source: "revenuecat",
      status: "active",
      expires_at: future,
      will_renew: true,
      external_id: "1000000652379790",
      external_customer: RC_ANON,
    });
  });

  it("marks unsubscribed, billing-issue, refunded and lapsed subscriptions", () => {
    const base = (sub: Record<string, unknown>, expires = future) => ({
      entitlements: { plus: { expires_date: expires, product_identifier: "p" } },
      subscriptions: { p: { expires_date: expires, ...sub } },
    });
    expect(revenueCatSubscriberRow(base({ unsubscribe_detected_at: past }), UID, now)).toMatchObject({ status: "active", will_renew: false });
    const graceUntil = new Date(NOW + 5 * 86_400_000).toISOString();
    expect(revenueCatSubscriberRow(base({ billing_issues_detected_at: past, grace_period_expires_date: graceUntil }), UID, now)).toMatchObject({
      status: "grace",
      expires_at: graceUntil,
    });
    expect(revenueCatSubscriberRow(base({ refunded_at: past }), UID, now)).toMatchObject({ status: "revoked", will_renew: false });
    expect(revenueCatSubscriberRow(base({}, past), UID, now)).toMatchObject({ status: "expired", will_renew: false, expires_at: past });
    // A lifetime (null expiry) "subscription" is not something Plus sells.
    expect(revenueCatSubscriberRow({ entitlements: { plus: { expires_date: null } } }, UID, now)).toBeNull();
  });
});

describe("Stripe mapping", () => {
  const periodEnd = Math.floor(LATER_MS / 1000);
  const sub = (over: Record<string, unknown> = {}) => ({
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    metadata: { uid: UID },
    ...over,
  });

  it("maps subscription statuses", () => {
    expect(stripeStatusToEntitlement("active")).toBe("active");
    expect(stripeStatusToEntitlement("trialing")).toBe("active");
    expect(stripeStatusToEntitlement("past_due")).toBe("grace");
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "weird"]) expect(stripeStatusToEntitlement(s)).toBe("expired");
  });

  it("reads the period end from the subscription or from its items (API 2025-03-31+)", () => {
    expect(stripePeriodEnd({ current_period_end: periodEnd })).toBe(new Date(LATER_MS).toISOString());
    expect(stripePeriodEnd({ items: { data: [{ current_period_end: periodEnd }] } })).toBe(new Date(LATER_MS).toISOString());
    expect(stripePeriodEnd({ items: { data: [{}] } })).toBeNull();
  });

  it("builds the row, with an expanded customer object and a scheduled cancellation", () => {
    expect(stripeSubscriptionRow(sub(), UID)).toEqual({
      user_id: UID,
      product: "plus",
      source: "stripe",
      status: "active",
      expires_at: new Date(LATER_MS).toISOString(),
      will_renew: true,
      external_id: "sub_1",
      external_customer: "cus_1",
    });
    expect(stripeSubscriptionRow(sub({ customer: { id: "cus_2" }, cancel_at_period_end: true }), UID)).toMatchObject({ external_customer: "cus_2", will_renew: false });
    expect(stripeSubscriptionRow(sub({ status: "canceled" }), UID)).toMatchObject({ status: "expired", will_renew: false });
    expect(stripeSubscriptionRow(sub({ current_period_end: null }), UID)).toBeNull();
  });

  it("acts on subscription events by their metadata uid, and asks to fetch on checkout completion", () => {
    expect(stripeAction({ id: "e", type: "customer.subscription.updated", data: { object: sub() } })).toMatchObject({ kind: "upsert", row: { status: "active", user_id: UID } });
    expect(stripeAction({ id: "e", type: "customer.subscription.deleted", data: { object: sub() } })).toMatchObject({ kind: "upsert", row: { status: "expired" } });
    expect(stripeAction({ id: "e", type: "customer.subscription.created", data: { object: sub({ metadata: {} }) } })).toEqual({ kind: "ignore", reason: "subscription_without_uid" });
    expect(stripeAction({ id: "e", type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: UID, subscription: "sub_9" } } })).toEqual({
      kind: "fetch_subscription",
      subscriptionId: "sub_9",
      userId: UID,
    });
    expect(stripeAction({ id: "e", type: "checkout.session.completed", data: { object: { mode: "payment", client_reference_id: UID } } }).kind).toBe("ignore");
    expect(stripeAction({ id: "e", type: "invoice.paid", data: { object: {} } })).toEqual({ kind: "ignore", reason: "unhandled_type:invoice.paid" });
  });

  it("picks the entitled subscription with the latest period end, else the most recently ended", () => {
    const a = sub({ id: "a", status: "canceled", current_period_end: periodEnd - 100 });
    const b = sub({ id: "b", status: "active", current_period_end: periodEnd - 50 });
    const c = sub({ id: "c", status: "past_due", current_period_end: periodEnd });
    expect(pickStripeSubscription([a, b, c])?.id).toBe("c");
    expect(pickStripeSubscription([a, sub({ id: "d", status: "canceled", current_period_end: periodEnd })])?.id).toBe("d");
    expect(pickStripeSubscription([])).toBeNull();
  });
});

describe("Stripe signatures", () => {
  const secret = "whsec_test_secret";
  const body = '{"id":"evt_1","type":"customer.subscription.updated"}';
  const t = 1_700_000_000;

  it("parses the header and ignores v0 and malformed parts", () => {
    const v1 = "a".repeat(64);
    expect(parseStripeSignature(`t=${t},v1=${v1},v0=${"b".repeat(64)}`)).toEqual({ timestamp: t, signatures: [v1] });
    expect(parseStripeSignature(`t=${t}`)).toBeNull();
    expect(parseStripeSignature(`v1=${v1}`)).toBeNull();
    expect(parseStripeSignature(null)).toBeNull();
  });

  it("accepts Stripe's own signature scheme (HMAC-SHA256 of `t.body`) within the tolerance", async () => {
    // Computed independently with Node's createHmac("sha256", secret).update(`${t}.${body}`).
    const expected = "0d61487f09b9af74bab9136d29b42415a42bf22e4ab9eb82886337697ef0fe84";
    const header = `t=${t},v1=${expected}`;
    expect(await signStripePayload(body, secret, t)).toBe(header);
    expect(await verifyStripeSignature(body, header, secret, t + 10)).toBe(true);
    expect(await verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)},v1=${expected}`, secret, t)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, a stale timestamp and a missing header", async () => {
    const header = await signStripePayload(body, secret, t);
    expect(await verifyStripeSignature(body + " ", header, secret, t)).toBe(false);
    expect(await verifyStripeSignature(body, header, "whsec_other", t)).toBe(false);
    expect(await verifyStripeSignature(body, header, secret, t + 301)).toBe(false);
    expect(await verifyStripeSignature(body, header, secret, t - 301)).toBe(false);
    expect(await verifyStripeSignature(body, null, secret, t)).toBe(false);
    expect(await verifyStripeSignature(body, header, "", t)).toBe(false);
  });
});

describe("stripeReconcilePlan", () => {
  const row = (status: "active" | "grace" | "expired" | "revoked", external_id: string | null, source: "stripe" | "revenuecat" = "stripe") => ({
    source,
    status,
    external_id,
  });

  it("re-reads a known subscription by id, preferring a live row over a lapsed one", () => {
    expect(stripeReconcilePlan([row("expired", "sub_old"), row("active", "sub_live")])).toEqual({ kind: "fetch", subscriptionId: "sub_live" });
    expect(stripeReconcilePlan([row("grace", "sub_grace")])).toEqual({ kind: "fetch", subscriptionId: "sub_grace" });
    expect(stripeReconcilePlan([row("expired", "sub_old")])).toEqual({ kind: "fetch", subscriptionId: "sub_old" });
  });

  it("searches only when no Stripe row names a subscription", () => {
    expect(stripeReconcilePlan([])).toEqual({ kind: "search" });
    expect(stripeReconcilePlan([row("active", null)])).toEqual({ kind: "search" });
    expect(stripeReconcilePlan([row("active", "rc_user", "revenuecat")])).toEqual({ kind: "search" });
  });
});

describe("checkoutOrigin", () => {
  const site = "https://crosswordclash.com";

  it("returns the site for no origin, a third-party origin, or a look-alike", () => {
    expect(checkoutOrigin(null, site)).toBe(site);
    expect(checkoutOrigin("https://evil.example", site)).toBe(site);
    expect(checkoutOrigin("https://crossword-clash-abc-amarchers-projects.vercel.app.evil.example", site)).toBe(site);
    expect(checkoutOrigin("http://crossword-clash-abc-amarchers-projects.vercel.app", site)).toBe(site);
  });

  it("keeps the site itself and this project's preview deployments, without a trailing slash", () => {
    expect(checkoutOrigin("https://crosswordclash.com/", site + "/")).toBe(site);
    expect(checkoutOrigin("https://crossword-clash-8ol25cf9v-amarchers-projects.vercel.app", site)).toBe(
      "https://crossword-clash-8ol25cf9v-amarchers-projects.vercel.app",
    );
    expect(checkoutOrigin("https://crossword-clash-git-claude-portal-config-amarchers-projects.vercel.app/", site)).toBe(
      "https://crossword-clash-git-claude-portal-config-amarchers-projects.vercel.app",
    );
  });
});
