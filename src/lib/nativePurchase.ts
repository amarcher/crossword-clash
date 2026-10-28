/**
 * Buying Plus in the NATIVE apps through RevenueCat (docs/monetization-spec.md
 * §2.7, §3.5): the SDK is configured with the Supabase uid as `appUserID`
 * (anonymous users included; Apple's 5.1.1(v) lets a purchase attach to the
 * device's anonymous id), `logIn` follows the uid when a sign-in changes it
 * (RevenueCat then merges or emits TRANSFER, which verify-purchase applies),
 * purchases go through the current offering's `$rc_annual` / `$rc_monthly`
 * packages, and after every purchase or restore the app asks verify-purchase
 * to reconcile so the `entitlements` row exists before the webhook lands.
 *
 * The plugin is imported dynamically behind the mobile-mode switch, so the
 * web bundle never carries it. Public SDK keys are build-time env
 * (VITE_REVENUECAT_IOS_KEY / VITE_REVENUECAT_ANDROID_KEY); they are safe on
 * the client by design.
 */
import { Capacitor } from "@capacitor/core";
import type { PlusPlan } from "./plusPurchase";

type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");
type Purchases = PurchasesModule["Purchases"];
type PurchasesPackage = import("@revenuecat/purchases-capacitor").PurchasesPackage;

export interface NativePlanPrice {
  plan: PlusPlan;
  /** The store's localized price string, e.g. "$24.99". */
  priceString: string;
}

function platformKey(platform = Capacitor.getPlatform()): string | undefined {
  const env = import.meta.env as { VITE_REVENUECAT_IOS_KEY?: string; VITE_REVENUECAT_ANDROID_KEY?: string };
  if (platform === "ios") return env.VITE_REVENUECAT_IOS_KEY;
  if (platform === "android") return env.VITE_REVENUECAT_ANDROID_KEY;
  return undefined;
}

/** The platform a store subscription is managed on, for storeManagementUrl. */
export function purchasePlatform(): "ios" | "android" | "web" {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

/** Whether this build can sell Plus through the stores: the native app with a RevenueCat key for its platform. */
export function nativePurchaseAvailable(): boolean {
  return import.meta.env.MODE === "mobile" && Capacitor.isNativePlatform() && !!platformKey();
}

let sdk: Promise<PurchasesModule> | null = null;
let configuredFor: string | null = null;

/**
 * The plugin module. Callers read `.Purchases` off it synchronously, and no
 * promise here may ever resolve with the `Purchases` object itself: it is a
 * Proxy that answers every property, `then` included, with a native-method
 * wrapper, so a promise resolved with it is treated as a thenable, calls a
 * native "then" that never answers, and hangs forever (the 1.1.0 build 10
 * paywall froze on exactly this). A module namespace object has no `then`.
 */
async function sdkModule(): Promise<PurchasesModule> {
  // The static switch lets Rollup drop the import (and the plugin's chunk) from web builds.
  if (import.meta.env.MODE !== "mobile") throw new Error("Store purchases are only available in the apps.");
  if (!sdk) sdk = import("@revenuecat/purchases-capacitor");
  return sdk;
}

/** Never `await purchases()` through another promise's resolution value; see sdkModule. */
async function purchases(): Promise<{ p: Purchases }> {
  return { p: (await sdkModule()).Purchases };
}

/**
 * Configures the SDK for the session user, or switches it to a new user
 * (`logIn`) when the uid changes after a sign-in. Idempotent per uid.
 */
export async function syncNativePurchaseUser(userId: string): Promise<void> {
  if (!nativePurchaseAvailable()) return;
  const key = platformKey();
  if (!key || configuredFor === userId) return;
  const { p } = await purchases();
  // configure is a fire-and-forget native method (no promise); logIn answers.
  if (configuredFor === null) p.configure({ apiKey: key, appUserID: userId });
  else await p.logIn({ appUserID: userId });
  configuredFor = userId;
}

const PACKAGE_FOR_PLAN: Record<PlusPlan, string> = { annual: "$rc_annual", monthly: "$rc_monthly" };

async function currentPackages(): Promise<PurchasesPackage[]> {
  const offerings = await (await purchases()).p.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

/** The two plans' store prices from the current offering (empty when the store has no offering yet). */
export async function fetchNativePrices(): Promise<NativePlanPrice[]> {
  if (!nativePurchaseAvailable()) return [];
  try {
    const packages = await currentPackages();
    return (Object.keys(PACKAGE_FOR_PLAN) as PlusPlan[])
      .map((plan) => ({ plan, pkg: packages.find((p) => p.identifier === PACKAGE_FOR_PLAN[plan]) }))
      .filter((x): x is { plan: PlusPlan; pkg: PurchasesPackage } => !!x.pkg)
      .map(({ plan, pkg }) => ({ plan, priceString: pkg.product.priceString }));
  } catch {
    return [];
  }
}

export type NativePurchaseOutcome = "purchased" | "cancelled";

/** Buys a plan through the store. Throws on a real error; a user cancellation is an outcome, not an error. */
export async function purchaseNativePlan(plan: PlusPlan): Promise<NativePurchaseOutcome> {
  const { p } = await purchases();
  const pkg = (await currentPackages()).find((x) => x.identifier === PACKAGE_FOR_PLAN[plan]);
  if (!pkg) throw new Error("That plan isn't available in the store right now.");
  try {
    await p.purchasePackage({ aPackage: pkg });
    return "purchased";
  } catch (err) {
    if (err && typeof err === "object" && (err as { userCancelled?: boolean | null }).userCancelled) return "cancelled";
    throw err;
  }
}

/** Re-presents the store receipt (a new device, a reinstall). The caller reconciles afterwards. */
export async function restoreNativePurchases(): Promise<void> {
  await (await purchases()).p.restorePurchases();
}

/** Test hook. */
export function resetNativePurchasesForTests(): void {
  sdk = null;
  configuredFor = null;
}
