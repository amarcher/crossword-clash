import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatDay, formatPrice, planName, purchaseAlertText, revenueCatAlert, shortUid, storeName, stripeAlert } from "./purchaseAlert";
import type { RevenueCatEvent } from "./purchaseEvents";

const UID = "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const OTHER = "0f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const RC_ANON = "$RCAnonymousID:8069238d6049ce87cc529853916d624c";
const DEC_4 = Date.UTC(2026, 11, 4, 12);
const NOV_4_NEXT = Date.UTC(2027, 10, 4, 12);

type RcEvent = RevenueCatEvent & Record<string, unknown>;

function rc(over: Partial<RcEvent>): { event: RcEvent } {
  return {
    event: {
      id: "evt-1",
      type: "INITIAL_PURCHASE",
      app_user_id: UID,
      original_app_user_id: RC_ANON,
      aliases: [RC_ANON],
      entitlement_ids: ["plus"],
      product_id: "plus_monthly",
      store: "APP_STORE",
      period_type: "NORMAL",
      price: 3.99,
      price_in_purchased_currency: 3.99,
      currency: "USD",
      transaction_id: "200000000000002",
      original_transaction_id: "200000000000000",
      expiration_at_ms: DEC_4,
      environment: "PRODUCTION",
      ...over,
    },
  };
}

function stripeSub(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: NOV_4_NEXT / 1000, price: { id: "price_1", lookup_key: "crossword-clash-plus-annual", unit_amount: 2499, currency: "usd", recurring: { interval: "year" } } }] },
    metadata: { uid: UID },
    ...over,
  };
}

function stripe(type: string, object: Record<string, unknown>, previous_attributes?: Record<string, unknown>, livemode = true) {
  return { id: "evt_1", type, livemode, data: { object, ...(previous_attributes ? { previous_attributes } : {}) } };
}

describe("the Deno mirror", () => {
  it("is byte-for-byte the src module's MIRROR block", () => {
    const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
    const block = (text: string) => text.slice(text.indexOf("// --- MIRROR START ---"), text.indexOf("// --- MIRROR END ---"));
    const src = readFileSync(here("./purchaseAlert.ts"), "utf8");
    const deno = readFileSync(here("../../supabase/functions/_shared/purchaseAlert.ts"), "utf8");
    expect(block(src).length).toBeGreaterThan(1000);
    expect(block(deno)).toBe(block(src));
    expect(deno).toContain('from "./purchaseEvents.ts"');
  });
});

describe("the pieces", () => {
  it("names the plan from any store's product id or Stripe's interval", () => {
    expect(planName("plus_monthly")).toBe("Plus Monthly");
    expect(planName("plus_annual:annual")).toBe("Plus Annual");
    expect(planName("crossword-clash-plus-annual")).toBe("Plus Annual");
    expect(planName("price_1", "month")).toBe("Plus Monthly");
    expect(planName("plus_lifetime")).toBe("Plus (plus_lifetime)");
    expect(planName(undefined)).toBe("Plus");
  });

  it("names the store", () => {
    expect(storeName("APP_STORE")).toBe("App Store");
    expect(storeName("PLAY_STORE")).toBe("Google Play");
    expect(storeName("MAC_APP_STORE")).toBe("Mac App Store");
    expect(storeName("PROMOTIONAL")).toBe("Promotional");
    expect(storeName("ROKU")).toBe("ROKU");
    expect(storeName(undefined)).toBe("unknown store");
  });

  it("formats the day in UTC, the price by currency and the uid as a prefix", () => {
    expect(formatDay(new Date(DEC_4).toISOString())).toBe("Dec 4, 2026");
    expect(formatDay(null)).toBeNull();
    expect(formatDay("not a date")).toBeNull();
    expect(formatPrice(3.99, "USD")).toBe("$3.99");
    expect(formatPrice(3.49, "eur")).toBe("3.49 EUR");
    expect(formatPrice(0, "USD")).toBeNull();
    expect(formatPrice(null, "USD")).toBeNull();
    expect(shortUid(UID)).toBe("6f1d2c3b");
    expect(shortUid(RC_ANON)).toBeNull();
    expect(shortUid(null)).toBeNull();
  });
});

describe("revenueCatAlert", () => {
  it("announces a new subscriber with the plan, store, renewal day, price, uid prefix and the active count", () => {
    expect(revenueCatAlert(rc({}), { activeCount: 3 })).toBe("💰 New Plus subscriber · Plus Monthly · App Store · renews Dec 4, 2026 · $3.99 · user 6f1d2c3b · 3 active");
    expect(revenueCatAlert(rc({}))).toBe("💰 New Plus subscriber · Plus Monthly · App Store · renews Dec 4, 2026 · $3.99 · user 6f1d2c3b");
  });

  it("marks a sandbox purchase and names Google Play's product ids", () => {
    const text = revenueCatAlert(rc({ type: "RENEWAL", environment: "SANDBOX", store: "PLAY_STORE", product_id: "plus_annual:annual", price: 24.99, price_in_purchased_currency: 24.99, expiration_at_ms: NOV_4_NEXT }));
    expect(text).toBe("🔁 Renewal (sandbox) · Plus Annual · Google Play · renews Nov 4, 2027 · $24.99 · user 6f1d2c3b");
  });

  it("tells a trial, its conversion, an intro offer and a one-time purchase apart", () => {
    expect(revenueCatAlert(rc({ period_type: "TRIAL", price: 0, price_in_purchased_currency: 0 }))).toBe("🆓 Free trial started · Plus Monthly · App Store · trial ends Dec 4, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "RENEWAL", is_trial_conversion: true }))).toContain("💰 Trial converted · Plus Monthly");
    expect(revenueCatAlert(rc({ period_type: "INTRO", price_in_purchased_currency: 1.99 }))).toBe("💰 New Plus subscriber (intro offer) · Plus Monthly · App Store · renews Dec 4, 2026 · $1.99 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "NON_RENEWING_PURCHASE" }))).toBe("💰 One-time purchase · Plus Monthly · App Store · until Dec 4, 2026 · $3.99 · user 6f1d2c3b");
  });

  it("reports the lifecycle: billing issue, cancellation, refund, resubscribe, pause, expiry, extension, plan change", () => {
    expect(revenueCatAlert(rc({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: Date.UTC(2026, 11, 20, 12) }))).toBe("⚠️ Billing issue · Plus Monthly · App Store · grace until Dec 20, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }))).toBe("❌ Cancelled · Plus Monthly · App Store · access until Dec 4, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "CANCELLATION", cancel_reason: "BILLING_ERROR" }))).toBe("⚠️ Cancelled after billing failed · Plus Monthly · App Store · access until Dec 4, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }))).toBe("↩️ Refunded · Plus Monthly · App Store · access revoked · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "UNCANCELLATION" }))).toBe("✅ Resubscribed · Plus Monthly · App Store · renews Dec 4, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "SUBSCRIPTION_PAUSED", store: "PLAY_STORE" }))).toBe("⏸️ Paused · Plus Monthly · Google Play · access until Dec 4, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "EXPIRATION", expiration_reason: "BILLING_ERROR", expiration_at_ms: null }))).toBe("⌛ Expired · Plus Monthly · App Store · billing failed · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "EXPIRATION", expiration_reason: "SOMETHING_NEW" }))).toBe("⌛ Expired · Plus Monthly · App Store · something_new · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "SUBSCRIPTION_EXTENDED" }))).toBe("➕ Extended · Plus Monthly · App Store · renews Dec 4, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "PRODUCT_CHANGE", new_product_id: "plus_annual" }))).toBe("🔀 Plan change · Plus Monthly → Plus Annual · App Store · takes effect Dec 4, 2026 · user 6f1d2c3b");
    expect(revenueCatAlert(rc({ type: "TEMPORARY_ENTITLEMENT_GRANT" }))).toBe("🎁 Temporary access granted · Plus Monthly · App Store · until Dec 4, 2026 · user 6f1d2c3b");
  });

  it("reports a transfer by both uid prefixes and never a RevenueCat anonymous id", () => {
    expect(revenueCatAlert(rc({ type: "TRANSFER", transferred_from: [RC_ANON, OTHER], transferred_to: [UID] }))).toBe("🔄 Purchase moved between accounts · Plus Monthly · App Store · user 0f1d2c3b → 6f1d2c3b");
  });

  it("is quiet about TEST, invoice and other-entitlement events", () => {
    expect(revenueCatAlert(rc({ type: "TEST" }))).toBeNull();
    expect(revenueCatAlert(rc({ type: "INVOICE_ISSUANCE" }))).toBeNull();
    expect(revenueCatAlert(rc({ type: "VIRTUAL_CURRENCY_TRANSACTION" }))).toBeNull();
    expect(revenueCatAlert(rc({ entitlement_ids: ["supporter"] }))).toBeNull();
    expect(revenueCatAlert({})).toBeNull();
    expect(revenueCatAlert(null)).toBeNull();
  });

  it("flags a purchase the writer could not apply, so support sees it", () => {
    expect(revenueCatAlert(rc({ app_user_id: RC_ANON, aliases: [] }))).toBe("ℹ️ RevenueCat INITIAL_PURCHASE · Plus Monthly · App Store · not applied (no Supabase user on the event)");
    expect(revenueCatAlert(rc({ expiration_at_ms: null }))).toBe("ℹ️ RevenueCat INITIAL_PURCHASE · Plus Monthly · App Store · not applied (active_without_expiry)");
    expect(revenueCatAlert(rc({ type: "SOMETHING_NEW" }))).toBe("ℹ️ RevenueCat SOMETHING_NEW · Plus Monthly · App Store · not applied (unhandled_type:SOMETHING_NEW)");
  });

  it("never carries the whole uid, an email or a name", () => {
    const text = revenueCatAlert(rc({ subscriber_attributes: { $email: { value: "someone@example.com" } } }))!;
    expect(text).not.toContain(UID);
    expect(text).not.toContain("example.com");
    expect(text).not.toContain(RC_ANON);
  });
});

describe("stripeAlert", () => {
  it("announces a new web subscriber from the price's lookup key, with the period end and the price", () => {
    expect(stripeAlert(stripe("customer.subscription.created", stripeSub()), { activeCount: 4 })).toBe("💳 New Plus subscriber · Plus Annual · Stripe (web) · renews Nov 4, 2027 · $24.99 · user 6f1d2c3b · 4 active");
  });

  it("marks test mode and tells a pending first payment and a trial apart", () => {
    expect(stripeAlert(stripe("customer.subscription.created", stripeSub(), undefined, false))).toBe("💳 New Plus subscriber (test mode) · Plus Annual · Stripe (web) · renews Nov 4, 2027 · $24.99 · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.created", stripeSub({ status: "incomplete" })))).toBe("💳 New Plus subscriber · Plus Annual · Stripe (web) · payment pending · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.created", stripeSub({ status: "trialing" })))).toBe("🆓 Free trial started · Plus Annual · Stripe (web) · trial ends Nov 4, 2027 · user 6f1d2c3b");
  });

  it("reads an update through previous_attributes: cancel, resubscribe, payment failed and recovered, trial converted", () => {
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub({ cancel_at_period_end: true }), { cancel_at_period_end: false }))).toBe("❌ Cancelled · Plus Annual · Stripe (web) · access until Nov 4, 2027 · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { cancel_at_period_end: true }))).toBe("✅ Resubscribed · Plus Annual · Stripe (web) · renews Nov 4, 2027 · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub({ status: "past_due" }), { status: "active" }))).toBe("⚠️ Payment failed · Plus Annual · Stripe (web) · Stripe is retrying · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { status: "past_due" }))).toBe("✅ Payment recovered · Plus Annual · Stripe (web) · renews Nov 4, 2027 · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { status: "trialing" }))).toBe("💰 Trial converted · Plus Annual · Stripe (web) · renews Nov 4, 2027 · $24.99 · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { status: "incomplete" }))).toBe("💳 New Plus subscriber · Plus Annual · Stripe (web) · renews Nov 4, 2027 · $24.99 · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub({ status: "unpaid" }), { status: "past_due" }))).toBe("⌛ Unpaid · Plus Annual · Stripe (web) · access ended · user 6f1d2c3b");
  });

  it("tells a renewal from a plan change by the items that changed", () => {
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { current_period_end: 1, latest_invoice: "in_0" }))).toBe("🔁 Renewal · Plus Annual · Stripe (web) · renews Nov 4, 2027 · $24.99 · user 6f1d2c3b");
    const monthly = { data: [{ price: { id: "price_0", lookup_key: "crossword-clash-plus-monthly", recurring: { interval: "month" } } }] };
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { items: monthly }))).toBe("🔀 Plan change · Plus Monthly → Plus Annual · Stripe (web) · renews Nov 4, 2027 · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { items: { data: [{ price: { id: "price_1", lookup_key: "crossword-clash-plus-annual" } }] } }))).toContain("🔁 Renewal");
  });

  it("is quiet about checkout sessions, an update that changed only metadata, and event types the endpoint never sends", () => {
    expect(stripeAlert(stripe("checkout.session.completed", { mode: "subscription", client_reference_id: UID, subscription: "sub_1" }))).toBeNull();
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub(), { metadata: { note: "x" } }))).toBeNull();
    expect(stripeAlert(stripe("customer.subscription.updated", stripeSub()))).toBeNull();
    expect(stripeAlert(stripe("invoice.paid", {}))).toBeNull();
    expect(stripeAlert(null)).toBeNull();
  });

  it("reports the end of a subscription with Stripe's reason, and a subscription without a uid as not applied", () => {
    expect(stripeAlert(stripe("customer.subscription.deleted", stripeSub({ status: "canceled", cancellation_details: { reason: "cancellation_requested" } })))).toBe("⌛ Subscription ended · Plus Annual · Stripe (web) · after cancelling · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.deleted", stripeSub({ status: "canceled", cancellation_details: { reason: "payment_failed" } })))).toBe("⌛ Subscription ended · Plus Annual · Stripe (web) · payment failed · user 6f1d2c3b");
    expect(stripeAlert(stripe("customer.subscription.created", stripeSub({ metadata: {} })))).toBe("ℹ️ Stripe customer.subscription.created · Stripe (web) · not applied (subscription_without_uid)");
  });
});

describe("purchaseAlertText", () => {
  it("routes a row by its source and names an unknown source plainly", () => {
    expect(purchaseAlertText({ source: "revenuecat", kind: "INITIAL_PURCHASE", user_id: UID, payload: rc({}) })).toContain("💰 New Plus subscriber");
    expect(purchaseAlertText({ source: "stripe", kind: "customer.subscription.created", user_id: UID, payload: stripe("customer.subscription.created", stripeSub()) })).toContain("💳 New Plus subscriber");
    expect(purchaseAlertText({ source: "revenuecat", kind: "TEST", user_id: null, payload: rc({ type: "TEST" }) })).toBeNull();
    expect(purchaseAlertText({ source: "admob", kind: "rewarded", user_id: UID, payload: {} }, { activeCount: 2 })).toBe("ℹ️ admob rewarded · user 6f1d2c3b · 2 active");
  });
});
