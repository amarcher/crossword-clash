/**
 * The Stripe objects Crossword Clash Plus needs in an account — the product,
 * its two recurring prices and the webhook endpoint that feeds
 * `verify-purchase` — as the Stripe API wants them (form-encoded). Pure, so
 * `pnpm stripe:setup` and its test share one definition and the live-mode
 * run on launch day makes exactly what test mode had.
 *
 * Crossword Clash has its own Stripe account (decision of 2026-10-27: a
 * buyer's card statement and the Checkout page carry the account's name, so
 * Plus could not live on the Fable Designer account). Everything here is
 * found again by a marker rather than by id: products by metadata, prices by
 * `lookup_key`, the endpoint by its URL.
 */

import { STRIPE_API_VERSION } from "./purchaseEvents";

export const PLUS_MARKER = { key: "app", value: "crossword-clash-plus" } as const;

export const PLUS_PRODUCT = {
  name: "Crossword Clash Plus",
  /** Must equal `plus.subtitle` in src/i18n/en.json (the test holds them together). */
  description: "Every past daily, the construction studio, the AI host and your progress on every device.",
  /** What the card statement says for subscription charges: at most 22 characters, letters/digits/spaces. */
  statementDescriptor: "CROSSWORD CLASH PLUS",
} as const;

export type PlusPlan = "monthly" | "annual";

export interface PlusPrice {
  plan: PlusPlan;
  /** Stable handle a rerun finds the price by; `transfer_lookup_key` moves it onto a replacement. */
  lookupKey: string;
  /** Cents, USD. */
  unitAmount: number;
  interval: "month" | "year";
}

export const PLUS_PRICES: readonly PlusPrice[] = [
  { plan: "monthly", lookupKey: "crossword-clash-plus-monthly", unitAmount: 399, interval: "month" },
  { plan: "annual", lookupKey: "crossword-clash-plus-annual", unitAmount: 2499, interval: "year" },
];

/** The events `verify-purchase/stripe` handles; invoice events are deliberately absent (CLAUDE.md, Entitlements). */
export const PLUS_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

/** The version every API call is pinned to as well (`stripeHeaders`); the endpoint sends the same shape. */
export const PLUS_WEBHOOK_API_VERSION = STRIPE_API_VERSION;

export function productParams(): [string, string][] {
  return [
    ["name", PLUS_PRODUCT.name],
    ["description", PLUS_PRODUCT.description],
    ["statement_descriptor", PLUS_PRODUCT.statementDescriptor],
    [`metadata[${PLUS_MARKER.key}]`, PLUS_MARKER.value],
  ];
}

export function priceParams(product: string, price: PlusPrice): [string, string][] {
  if (!/^prod_/.test(product)) throw new Error(`not a product id: ${product}`);
  return [
    ["product", product],
    ["currency", "usd"],
    ["unit_amount", String(price.unitAmount)],
    ["recurring[interval]", price.interval],
    ["lookup_key", price.lookupKey],
    ["transfer_lookup_key", "true"],
    ["nickname", `Plus ${price.plan}`],
    [`metadata[${PLUS_MARKER.key}]`, PLUS_MARKER.value],
    ["metadata[plan]", price.plan],
  ];
}

/** Where Stripe sends the events: the `verify-purchase` function's Stripe route on the project. */
export function webhookUrl(supabaseUrl: string): string {
  const origin = supabaseUrl.replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)) throw new Error(`not a Supabase project URL: ${supabaseUrl}`);
  return `${origin}/functions/v1/verify-purchase/stripe`;
}

export function webhookParams(url: string, mode: "test" | "live"): [string, string][] {
  return [
    ["url", url],
    ["api_version", PLUS_WEBHOOK_API_VERSION],
    ["description", `Crossword Clash Plus subscriptions (${mode} mode) -> Supabase verify-purchase. Made by pnpm stripe:setup; see docs/plus-setup.md 1.3.`],
    ...PLUS_WEBHOOK_EVENTS.map((event): [string, string] => ["enabled_events[]", event]),
    [`metadata[${PLUS_MARKER.key}]`, PLUS_MARKER.value],
  ];
}

interface Marked {
  id: string;
  metadata?: Record<string, string> | null;
  active?: boolean;
}

/** Our product among the account's (an active one first, so an archived copy never wins). */
export function findProduct(products: readonly Marked[]): string | null {
  const ours = products.filter((p) => p.metadata?.[PLUS_MARKER.key] === PLUS_MARKER.value);
  return (ours.find((p) => p.active !== false) ?? ours[0])?.id ?? null;
}

export interface ExistingPrice {
  id: string;
  product: string;
  unit_amount?: number | null;
  currency?: string;
  recurring?: { interval?: string } | null;
  active?: boolean;
}

/**
 * Whether a price found by lookup key is the one we want. A price's amount
 * and interval are immutable in Stripe, so a mismatch means a human changed
 * the plan: the script refuses rather than silently creating a second price.
 */
export function priceMismatch(existing: ExistingPrice, want: PlusPrice, product: string): string | null {
  const problems: string[] = [];
  if (existing.product !== product) problems.push(`belongs to ${existing.product}, not ${product}`);
  if (existing.unit_amount !== want.unitAmount) problems.push(`charges ${existing.unit_amount ?? "?"} cents, not ${want.unitAmount}`);
  if ((existing.currency ?? "usd") !== "usd") problems.push(`is in ${existing.currency}, not usd`);
  if (existing.recurring?.interval !== want.interval) problems.push(`renews every ${existing.recurring?.interval ?? "?"}, not ${want.interval}`);
  if (existing.active === false) problems.push("is archived");
  return problems.length ? `${existing.id} (${want.lookupKey}) ${problems.join("; ")}` : null;
}

/** The endpoint already pointed at our function, if any. */
export function findWebhook(endpoints: readonly { id: string; url: string; status?: string }[], url: string): string | null {
  return endpoints.find((e) => e.url === url)?.id ?? null;
}

/** The one-line summary of an account the script prints so a key for the wrong account is caught before anything is made. */
export function describeAccount(account: {
  id?: string;
  settings?: { dashboard?: { display_name?: string | null }; payments?: { statement_descriptor?: string | null } } | null;
  business_profile?: { name?: string | null } | null;
}): { summary: string; looksLikeOurs: boolean } {
  const name = account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? "(unnamed)";
  const descriptor = account.settings?.payments?.statement_descriptor ?? "(no statement descriptor yet)";
  const looksLikeOurs = /crossword/i.test(`${name} ${descriptor}`);
  return { summary: `${name} · statement descriptor ${descriptor}`, looksLikeOurs };
}
