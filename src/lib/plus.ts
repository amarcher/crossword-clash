/**
 * The Plus launch switch. Every Plus gate, upsell and purchase surface asks
 * `plusEnabled()` first and behaves exactly as before Plus existed when it is
 * off, so the entitlements work can merge to main ahead of the launch
 * (docs/monetization-spec.md §4.1: "Flag VITE_PLUS=1 so main can merge before
 * launch"). Set VITE_PLUS=1 in the web build's env (Vercel) and in the mobile
 * build to turn it on; the server side (verify-purchase, has_entitlement) is
 * live regardless, since a row nobody reads costs nothing.
 */
export function plusEnabled(env: { VITE_PLUS?: string } = import.meta.env as { VITE_PLUS?: string }): boolean {
  return env.VITE_PLUS === "1";
}

/** Prices as sold in every store and on the web (spec decision 1). Display only: the stores and Stripe hold the real prices. */
export const PLUS_MONTHLY_USD = 3.99;
export const PLUS_ANNUAL_USD = 24.99;

/** The gates that can open the paywall, for the funnel (`paywall_viewed { placement, feature }`). */
export type PlusFeature = "archive" | "studio" | "narrator" | "reveal" | "progress";

/** Formats a price in USD for the pitch; the stores and Stripe show their own localized price at purchase. */
export function formatUsd(amount: number, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/** The annual plan's saving over twelve monthly payments, as a whole percentage (48). */
export function annualSavingPercent(monthly: number = PLUS_MONTHLY_USD, annual: number = PLUS_ANNUAL_USD): number {
  return Math.round((1 - annual / (monthly * 12)) * 100);
}
