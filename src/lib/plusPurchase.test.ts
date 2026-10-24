import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("./supabaseClient", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

import { checkoutReturn, openBillingPortal, reconcileEntitlements, startCheckout, storeManagementUrl, withoutCheckoutParam } from "./plusPurchase";
import type { EntitlementRow } from "./entitlements";

const row = (source: EntitlementRow["source"]) => ({ source });

beforeEach(() => {
  invoke.mockReset();
});

describe("checkout return", () => {
  it("reads the outcome from the query and strips it from the URL", () => {
    expect(checkoutReturn("?checkout=success")).toBe("success");
    expect(checkoutReturn("?a=1&checkout=cancelled")).toBe("cancelled");
    expect(checkoutReturn("?checkout=weird")).toBeNull();
    expect(checkoutReturn("")).toBeNull();
    expect(withoutCheckoutParam("https://crosswordclash.com/menu?checkout=success")).toBe("/menu");
    expect(withoutCheckoutParam("https://crosswordclash.com/archive?day=2026-10-01&checkout=cancelled#x")).toBe("/archive?day=2026-10-01#x");
  });
});

describe("storeManagementUrl", () => {
  it("points a store purchase at the store's subscription settings, and nothing else anywhere", () => {
    expect(storeManagementUrl(row("revenuecat"), "ios")).toContain("apps.apple.com/account/subscriptions");
    expect(storeManagementUrl(row("revenuecat"), "android")).toContain("play.google.com/store/account/subscriptions");
    expect(storeManagementUrl(row("apple"), "web")).toContain("apps.apple.com");
    expect(storeManagementUrl(row("google"), "web")).toContain("play.google.com");
    expect(storeManagementUrl(row("revenuecat"), "web")).toBeNull();
    expect(storeManagementUrl(row("stripe"), "ios")).toBeNull();
    expect(storeManagementUrl(row("grant"), "ios")).toBeNull();
    expect(storeManagementUrl(null, "ios")).toBeNull();
  });
});

describe("the web purchase calls", () => {
  it("starts Checkout for a plan with a return path and sends the browser to Stripe", async () => {
    invoke.mockResolvedValue({ data: { url: "https://checkout.stripe.com/c/pay/cs_test" }, error: null });
    const go = vi.fn();
    await startCheckout("annual", "/archive", go);
    expect(invoke).toHaveBeenCalledWith("create-checkout", { body: { plan: "annual", returnTo: "/archive" } });
    expect(go).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });

  it("explains an unconfigured or failed Checkout instead of redirecting", async () => {
    const go = vi.fn();
    invoke.mockResolvedValue({ data: { error: "not_configured" }, error: null });
    await expect(startCheckout("monthly", "/menu", go)).rejects.toThrow("Purchasing isn't available yet.");
    invoke.mockResolvedValue({ data: null, error: { message: "Edge Function returned a non-2xx status code" } });
    await expect(startCheckout("monthly", "/menu", go)).rejects.toThrow("non-2xx");
    expect(go).not.toHaveBeenCalled();
  });

  it("opens the billing portal and reconciles a source", async () => {
    const go = vi.fn();
    invoke.mockResolvedValue({ data: { url: "https://billing.stripe.com/p/session" }, error: null });
    await openBillingPortal("/menu", go);
    expect(invoke).toHaveBeenCalledWith("billing-portal", { body: { returnTo: "/menu" } });
    expect(go).toHaveBeenCalledWith("https://billing.stripe.com/p/session");

    const rows = [{ user_id: "u", product: "plus", status: "active" }];
    invoke.mockResolvedValue({ data: { entitlements: rows }, error: null });
    await expect(reconcileEntitlements("revenuecat")).resolves.toEqual(rows);
    expect(invoke).toHaveBeenLastCalledWith("verify-purchase/reconcile", { body: { source: "revenuecat" } });
  });
});
