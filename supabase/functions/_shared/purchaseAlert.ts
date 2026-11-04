/**
 * Purchase events → one Slack line each: Deno MIRROR of src/lib/purchaseAlert.ts.
 *
 * Edge functions run under Deno and are not covered by `tsc -b` or vitest, so
 * the authoritative, tested copy lives in src/lib/purchaseAlert.ts. Everything
 * between the MIRROR markers must stay byte-for-byte identical to that file's
 * block; src/lib/purchaseAlert.test.ts fails when it is not. Edit the src
 * copy, then paste the block here. Only the import line differs (Deno needs
 * the `.ts`).
 */
import { revenueCatAction, stripeAction, type RevenueCatEvent, type StripeEventLike } from "./purchaseEvents.ts";

// --- MIRROR START ---

/** The columns of a `purchase_events` row the builder reads (the webhook posts the whole row). */
export interface PurchaseEventRow {
  source: string;
  kind: string;
  user_id?: string | null;
  payload: unknown;
  received_at?: string | null;
}

export interface PurchaseAlertOptions {
  /** Plus rows in force once this event has been applied, for a trailing "N active"; omit when unknown. */
  activeCount?: number | null;
}

/** A RevenueCat webhook body as verify-purchase stores it: the whole `{ event }` envelope. */
interface RevenueCatPayload {
  event?: RevenueCatEvent & {
    store?: string;
    period_type?: string;
    price?: number | null;
    price_in_purchased_currency?: number | null;
    currency?: string | null;
    is_trial_conversion?: boolean;
    expiration_reason?: string;
    new_product_id?: string;
  };
}

/** The Stripe subscription fields the alert reads beyond what purchaseEvents parses. */
interface StripeSubscriptionAlertFields {
  status?: string;
  cancel_at_period_end?: boolean | null;
  items?: { data?: Array<{ price?: StripePriceLike | null }> } | null;
  cancellation_details?: { reason?: string | null } | null;
}

interface StripePriceLike {
  id?: string;
  lookup_key?: string | null;
  unit_amount?: number | null;
  currency?: string | null;
  recurring?: { interval?: string | null } | null;
}

/** A Stripe event as verify-purchase stores it (the event itself), with the `previous_attributes` an update carries. */
type StripePayload = StripeEventLike & { data?: { object?: Record<string, unknown>; previous_attributes?: Record<string, unknown> } };

/** The two plans as sold everywhere, named for a human. */
export function planName(productId: string | null | undefined, interval?: string | null): string {
  const id = (productId ?? "").toLowerCase();
  if (id.includes("annual") || id.includes("yearly") || interval === "year") return "Plus Annual";
  if (id.includes("monthly") || interval === "month") return "Plus Monthly";
  return productId ? `Plus (${productId})` : "Plus";
}

/** RevenueCat's `store` → the name a reader knows. */
export function storeName(store: string | null | undefined): string {
  switch ((store ?? "").toUpperCase()) {
    case "APP_STORE":
      return "App Store";
    case "MAC_APP_STORE":
      return "Mac App Store";
    case "PLAY_STORE":
      return "Google Play";
    case "AMAZON":
      return "Amazon Appstore";
    case "STRIPE":
      return "Stripe (via RevenueCat)";
    case "PROMOTIONAL":
      return "Promotional";
    case "":
      return "unknown store";
    default:
      return store as string;
  }
}

/** "Dec 4, 2026" in UTC, or null for anything but a parseable timestamp. */
export function formatDay(iso: string | null | undefined): string | null {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(ms));
}

/** "$3.99" for USD, "3.49 EUR" otherwise; null for no price or a free period. */
export function formatPrice(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const code = (currency ?? "USD").toUpperCase();
  return code === "USD" ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${code}`;
}

/** The first eight characters of a Supabase uid, the handle support matches against `entitlements`; null for anything else. */
export function shortUid(id: string | null | undefined): string | null {
  return typeof id === "string" && /^[0-9a-f]{8}-/i.test(id) ? id.slice(0, 8).toLowerCase() : null;
}

function line(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" · ");
}

function trailer(userId: string | null | undefined, opts: PurchaseAlertOptions): string[] {
  const uid = shortUid(userId);
  return [uid ? `user ${uid}` : null, typeof opts.activeCount === "number" ? `${opts.activeCount} active` : null].filter((p): p is string => !!p);
}

// ---------------------------------------------------------------------------
// RevenueCat
// ---------------------------------------------------------------------------

/** Event types that are bookkeeping, never a line. */
const REVENUECAT_QUIET = new Set(["TEST", "INVOICE_ISSUANCE", "VIRTUAL_CURRENCY_TRANSACTION"]);

const EXPIRATION_REASONS: Record<string, string> = {
  UNSUBSCRIBE: "after cancelling",
  BILLING_ERROR: "billing failed",
  DEVELOPER_INITIATED: "ended by us",
  PRICE_INCREASE: "price increase declined",
  CUSTOMER_SUPPORT: "by customer support",
  SUBSCRIPTION_PAUSED: "while paused",
};

/**
 * The Slack line for a RevenueCat event, or null for one not worth a line.
 * The status and dates come from `revenueCatAction` (sandbox allowed, since
 * the line only reports; the entitlement writer applies its own rule), the
 * wording from the event type.
 */
export function revenueCatAlert(payload: unknown, opts: PurchaseAlertOptions = {}): string | null {
  const event = (payload as RevenueCatPayload | null)?.event;
  if (!event || typeof event.type !== "string") return null;
  const type = event.type;
  if (REVENUECAT_QUIET.has(type)) return null;

  const sandbox = event.environment === "SANDBOX" ? " (sandbox)" : "";
  const plan = planName(event.product_id);
  const store = storeName(event.store);
  const action = revenueCatAction(event, { allowSandbox: true });

  if (action.kind === "transfer") {
    const from = action.from.map(shortUid).filter(Boolean).join(", ");
    const to = action.to.map(shortUid).filter(Boolean).join(", ");
    return line([`🔄 Purchase moved between accounts${sandbox}`, plan, store, `user ${from} → ${to}`, ...trailer(null, opts)]);
  }
  if (action.kind === "ignore") {
    if (action.reason === "other_entitlement") return null;
    const why = action.reason === "anonymous_app_user_id" ? "no Supabase user on the event" : action.reason;
    return line([`ℹ️ RevenueCat ${type}${sandbox}`, plan, store, `not applied (${why})`, ...trailer(null, opts)]);
  }

  const row = action.row;
  const expires = formatDay(row.expires_at);
  const price = formatPrice(event.price_in_purchased_currency ?? event.price, event.currency);
  let label: string;
  let detail: string | null;
  let planText = plan;
  let priceText: string | null = null;
  switch (type) {
    case "INITIAL_PURCHASE":
      if (event.period_type === "TRIAL") {
        label = "🆓 Free trial started";
        detail = expires && `trial ends ${expires}`;
      } else {
        label = event.period_type === "INTRO" ? "💰 New Plus subscriber (intro offer)" : "💰 New Plus subscriber";
        detail = expires && `renews ${expires}`;
        priceText = price;
      }
      break;
    case "RENEWAL":
      label = event.is_trial_conversion ? "💰 Trial converted" : "🔁 Renewal";
      detail = expires && `renews ${expires}`;
      priceText = price;
      break;
    case "UNCANCELLATION":
      label = "✅ Resubscribed";
      detail = expires && `renews ${expires}`;
      break;
    case "PRODUCT_CHANGE":
      label = "🔀 Plan change";
      planText = `${plan} → ${planName(event.new_product_id)}`;
      detail = expires && `takes effect ${expires}`;
      break;
    case "SUBSCRIPTION_EXTENDED":
      label = "➕ Extended";
      detail = expires && `renews ${expires}`;
      break;
    case "TEMPORARY_ENTITLEMENT_GRANT":
      label = "🎁 Temporary access granted";
      detail = expires && `until ${expires}`;
      break;
    case "NON_RENEWING_PURCHASE":
      label = "💰 One-time purchase";
      detail = expires && `until ${expires}`;
      priceText = price;
      break;
    case "CANCELLATION":
      if (row.status === "revoked") {
        label = "↩️ Refunded";
        detail = "access revoked";
      } else if (event.cancel_reason === "BILLING_ERROR") {
        label = "⚠️ Cancelled after billing failed";
        detail = expires && `access until ${expires}`;
      } else {
        label = "❌ Cancelled";
        detail = expires && `access until ${expires}`;
      }
      break;
    case "SUBSCRIPTION_PAUSED":
      label = "⏸️ Paused";
      detail = expires && `access until ${expires}`;
      break;
    case "BILLING_ISSUE":
      label = "⚠️ Billing issue";
      detail = expires && `grace until ${expires}`;
      break;
    case "EXPIRATION": {
      label = "⌛ Expired";
      const reason = event.expiration_reason ? EXPIRATION_REASONS[event.expiration_reason] ?? event.expiration_reason.toLowerCase() : null;
      detail = reason;
      break;
    }
    default:
      label = `ℹ️ RevenueCat ${type}`;
      detail = expires && `until ${expires}`;
  }
  return line([`${label}${sandbox}`, planText, store, detail, priceText, ...trailer(row.user_id, opts)]);
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

const STRIPE_STORE = "Stripe (web)";

function stripePrice(sub: StripeSubscriptionAlertFields): StripePriceLike | null {
  return sub.items?.data?.[0]?.price ?? null;
}

function stripePlan(price: StripePriceLike | null): string {
  return planName(price?.lookup_key ?? price?.id, price?.recurring?.interval);
}

/**
 * The Slack line for a Stripe event, or null for one not worth a line.
 * `checkout.session.completed` is quiet because `customer.subscription.created`
 * follows it; an `updated` is read through its `previous_attributes`, so a
 * metadata edit or a payment-method change stays quiet while a cancellation,
 * a renewal, a plan change or a status change speaks.
 */
export function stripeAlert(payload: unknown, opts: PurchaseAlertOptions = {}): string | null {
  const event = payload as StripePayload | null;
  if (!event || typeof event.type !== "string") return null;
  const type = event.type;
  if (type === "checkout.session.completed") return null;

  const test = event.livemode === false ? " (test mode)" : "";
  const action = stripeAction(event);
  if (action.kind === "fetch_subscription") return null;
  if (action.kind === "ignore") {
    if (action.reason.startsWith("unhandled_type:")) return null;
    return line([`ℹ️ Stripe ${type}${test}`, STRIPE_STORE, `not applied (${action.reason})`, ...trailer(null, opts)]);
  }

  const row = action.row;
  const sub = (event.data?.object ?? {}) as StripeSubscriptionAlertFields;
  const prev = event.data?.previous_attributes ?? {};
  const price = stripePrice(sub);
  const plan = stripePlan(price);
  const expires = formatDay(row.expires_at);
  const amount = formatPrice(typeof price?.unit_amount === "number" ? price.unit_amount / 100 : null, price?.currency);
  let label: string;
  let detail: string | null = null;
  let planText = plan;
  let priceText: string | null = null;

  if (type === "customer.subscription.created") {
    if (sub.status === "trialing") {
      label = "🆓 Free trial started";
      detail = expires && `trial ends ${expires}`;
    } else if (sub.status === "incomplete") {
      label = "💳 New Plus subscriber";
      detail = "payment pending";
    } else {
      label = "💳 New Plus subscriber";
      detail = expires && `renews ${expires}`;
      priceText = amount;
    }
  } else if (type === "customer.subscription.deleted") {
    label = "⌛ Subscription ended";
    const reason = sub.cancellation_details?.reason;
    detail = reason === "cancellation_requested" ? "after cancelling" : reason === "payment_failed" ? "payment failed" : null;
  } else if ("cancel_at_period_end" in prev) {
    if (sub.cancel_at_period_end) {
      label = "❌ Cancelled";
      detail = expires && `access until ${expires}`;
    } else {
      label = "✅ Resubscribed";
      detail = expires && `renews ${expires}`;
    }
  } else if ("status" in prev) {
    const was = String(prev.status ?? "");
    switch (sub.status) {
      case "past_due":
        label = "⚠️ Payment failed";
        detail = "Stripe is retrying";
        break;
      case "active":
        if (was === "past_due") {
          label = "✅ Payment recovered";
        } else if (was === "trialing") {
          label = "💰 Trial converted";
          priceText = amount;
        } else if (was === "incomplete") {
          label = "💳 New Plus subscriber";
          priceText = amount;
        } else {
          label = "✅ Active again";
        }
        detail = expires && `renews ${expires}`;
        break;
      case "unpaid":
        label = "⌛ Unpaid";
        detail = "access ended";
        break;
      case "paused":
        label = "⏸️ Paused";
        break;
      case "incomplete_expired":
        label = "⌛ Checkout abandoned";
        break;
      case "canceled":
        label = "⌛ Subscription ended";
        break;
      default:
        label = `ℹ️ Status ${sub.status ?? "unknown"}`;
    }
  } else if ("items" in prev || "current_period_end" in prev || "latest_invoice" in prev) {
    const before = (prev.items as StripeSubscriptionAlertFields["items"] | undefined)?.data?.[0]?.price ?? null;
    const beforePlan = before ? stripePlan(before) : plan;
    if (before && beforePlan !== plan) {
      label = "🔀 Plan change";
      planText = `${beforePlan} → ${plan}`;
      detail = expires && `renews ${expires}`;
    } else {
      label = "🔁 Renewal";
      detail = expires && `renews ${expires}`;
      priceText = amount;
    }
  } else {
    return null;
  }
  return line([`${label}${test}`, planText, STRIPE_STORE, detail, priceText, ...trailer(row.user_id, opts)]);
}

/** The Slack line for one `purchase_events` row, or null when the event deserves none. */
export function purchaseAlertText(row: PurchaseEventRow, opts: PurchaseAlertOptions = {}): string | null {
  if (row.source === "revenuecat") return revenueCatAlert(row.payload, opts);
  if (row.source === "stripe") return stripeAlert(row.payload, opts);
  return line([`ℹ️ ${row.source} ${row.kind}`, ...trailer(row.user_id, opts)]);
}
// --- MIRROR END ---
