/**
 * Buying and managing Plus on the WEB (docs/monetization-spec.md §2.7, §3.2):
 * Stripe Checkout through the create-checkout edge function, the Customer
 * Portal through billing-portal, and the reconcile route of verify-purchase
 * after a purchase or a restore. The native apps buy through RevenueCat
 * (nativePurchase.ts); both end in the same `entitlements` rows.
 *
 * Pure helpers (the checkout return, the store management link) are exported
 * for tests; the network calls take the Supabase client from the module.
 */
import { supabase } from "./supabaseClient";
import type { EntitlementRow } from "./entitlements";

export type PlusPlan = "monthly" | "annual";

export type CheckoutReturn = "success" | "cancelled" | null;

/** What a `?checkout=` query says about the page we just came back to. */
export function checkoutReturn(search: string): CheckoutReturn {
  const value = new URLSearchParams(search).get("checkout");
  return value === "success" || value === "cancelled" ? value : null;
}

/** The same URL without its `checkout` parameter, for history.replaceState. */
export function withoutCheckoutParam(url: string): string {
  const u = new URL(url, "http://x");
  u.searchParams.delete("checkout");
  const qs = u.searchParams.toString();
  return `${u.pathname}${qs ? `?${qs}` : ""}${u.hash}`;
}

/**
 * Where a subscriber manages a subscription that was NOT bought on the web:
 * the store's own subscription settings (Apple's 3.1.1 asks for a way to
 * manage; RevenueCat's `managementURL` is the same link). Null for a Stripe
 * row (the portal) and for a grant (nothing to manage).
 */
export function storeManagementUrl(row: Pick<EntitlementRow, "source"> | null, platform: "ios" | "android" | "web"): string | null {
  if (!row || row.source === "stripe" || row.source === "grant") return null;
  if (platform === "ios" || row.source === "apple") return "https://apps.apple.com/account/subscriptions";
  if (platform === "android" || row.source === "google") return "https://play.google.com/store/account/subscriptions?package=com.crosswordclash.app";
  return null;
}

function client() {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  return supabase;
}

function describe(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

/** Asks for a Checkout session and sends the browser there. Resolves only on failure to redirect. */
export async function startCheckout(plan: PlusPlan, returnTo: string = window.location.pathname, go: (url: string) => void = (url) => window.location.assign(url)): Promise<void> {
  const { data, error } = await client().functions.invoke<{ url?: string; error?: string }>("create-checkout", { body: { plan, returnTo } });
  if (error) throw new Error(describe(error, "Checkout couldn't be started."));
  if (!data?.url) throw new Error(data?.error === "not_configured" ? "Purchasing isn't available yet." : "Checkout couldn't be started.");
  go(data.url);
}

/** Opens Stripe's Customer Portal for a web subscription. */
export async function openBillingPortal(returnTo: string = window.location.pathname, go: (url: string) => void = (url) => window.location.assign(url)): Promise<void> {
  const { data, error } = await client().functions.invoke<{ url?: string; error?: string }>("billing-portal", { body: { returnTo } });
  if (error) throw new Error(describe(error, "The billing portal couldn't be opened."));
  if (!data?.url) throw new Error("The billing portal couldn't be opened.");
  go(data.url);
}

/**
 * Re-reads the vendor's view of this user and refreshes the rows: after a
 * Checkout return (the webhook may still be in flight) or a restore.
 */
export async function reconcileEntitlements(source: "stripe" | "revenuecat"): Promise<EntitlementRow[]> {
  const { data, error } = await client().functions.invoke<{ entitlements?: EntitlementRow[] }>("verify-purchase/reconcile", { body: { source } });
  if (error) throw new Error(describe(error, "Purchases couldn't be checked."));
  return data?.entitlements ?? [];
}
