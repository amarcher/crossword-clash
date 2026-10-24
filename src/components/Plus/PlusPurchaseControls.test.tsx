// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";

const purchase = { startCheckout: vi.fn(async () => {}), openBillingPortal: vi.fn(async () => {}), reconcileEntitlements: vi.fn(async () => []) };
vi.mock("../../lib/plusPurchase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/plusPurchase")>()),
  startCheckout: (...args: unknown[]) => purchase.startCheckout(...(args as [])),
  openBillingPortal: (...args: unknown[]) => purchase.openBillingPortal(...(args as [])),
  reconcileEntitlements: (...args: unknown[]) => purchase.reconcileEntitlements(...(args as [])),
}));
const native = { available: false, prices: [] as { plan: "annual" | "monthly"; priceString: string }[], outcome: "purchased" as "purchased" | "cancelled", restore: vi.fn(async () => {}) };
vi.mock("../../lib/nativePurchase", () => ({
  nativePurchaseAvailable: () => native.available,
  purchasePlatform: () => (native.available ? "ios" : "web"),
  fetchNativePrices: async () => native.prices,
  purchaseNativePlan: async () => native.outcome,
  restoreNativePurchases: () => native.restore(),
}));
const track = vi.fn();
vi.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

import { PlusPurchaseControls } from "./PlusPurchaseControls";
import type { EntitlementRow } from "../../lib/entitlements";

const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  user_id: "u1",
  product: "plus",
  source: "stripe",
  status: "active",
  expires_at: "2026-11-24T12:00:00.000Z",
  will_renew: true,
  external_id: "sub_1",
  external_customer: "cus_1",
  updated_at: "2026-10-24T12:00:00.000Z",
  ...over,
});
const refresh = vi.fn(async () => {});

beforeEach(() => {
  native.available = false;
  native.prices = [];
  native.outcome = "purchased";
  purchase.startCheckout.mockClear();
  purchase.openBillingPortal.mockClear();
  purchase.reconcileEntitlements.mockClear();
  native.restore.mockClear();
  track.mockClear();
  refresh.mockClear();
});
afterEach(cleanup);

describe("PlusPurchaseControls on the web", () => {
  it("offers the two plans with the list prices, annual first, and the legal links; no restore", () => {
    render(<PlusPurchaseControls account={{ signedIn: true, plus: false, plusRow: null, refreshEntitlements: refresh }} placement="test" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].textContent).toBe("Get Plus yearly · $24.99");
    expect(buttons[1].textContent).toBe("Monthly · $3.99");
    expect(screen.queryByRole("button", { name: "Restore purchases" })).toBeNull();
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });

  it("starts Stripe Checkout for the tapped plan with the return path, and tracks it", async () => {
    render(<PlusPurchaseControls account={{ signedIn: true, plus: false, plusRow: null, refreshEntitlements: refresh }} placement="archive" returnTo="/archive" />);
    fireEvent.click(screen.getByRole("button", { name: /Monthly/ }));
    await waitFor(() => expect(purchase.startCheckout).toHaveBeenCalledWith("monthly", "/archive"));
    expect(track).toHaveBeenCalledWith("checkout_started", { channel: "stripe", plan: "monthly", placement: "archive" });
  });

  it("shows the failure when Checkout cannot start", async () => {
    purchase.startCheckout.mockRejectedValueOnce(new Error("Purchasing isn't available yet."));
    render(<PlusPurchaseControls account={{ signedIn: true, plus: false, plusRow: null, refreshEntitlements: refresh }} placement="test" />);
    fireEvent.click(screen.getByRole("button", { name: /Get Plus yearly/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Purchasing isn't available yet."));
  });

  it("tells a subscriber when it renews and opens the Customer Portal for a Stripe subscription", async () => {
    render(<PlusPurchaseControls account={{ signedIn: true, plus: true, plusRow: row(), refreshEntitlements: refresh }} placement="test" returnTo="/menu" />);
    expect(screen.getByText(/Renews on November 24, 2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    await waitFor(() => expect(purchase.openBillingPortal).toHaveBeenCalledWith("/menu"));
  });

  it("says when a cancelled subscription ends, and offers nothing to manage for a grant", () => {
    render(<PlusPurchaseControls account={{ signedIn: true, plus: true, plusRow: row({ will_renew: false }), refreshEntitlements: refresh }} placement="test" />);
    expect(screen.getByText(/Ends on November 24, 2026/)).toBeTruthy();
    cleanup();
    render(<PlusPurchaseControls account={{ signedIn: true, plus: true, plusRow: row({ source: "grant", expires_at: null }), refreshEntitlements: refresh }} placement="test" />);
    expect(screen.getByText("Yours for good")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("PlusPurchaseControls in the apps", () => {
  beforeEach(() => {
    native.available = true;
  });

  it("shows the store's prices, buys through RevenueCat, reconciles, refreshes and tracks", async () => {
    native.prices = [{ plan: "annual", priceString: "24,99 €" }];
    render(<PlusPurchaseControls account={{ signedIn: false, plus: false, plusRow: null, refreshEntitlements: refresh }} placement="sheet" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Get Plus yearly · 24,99 €" })).toBeTruthy());
    // The monthly price falls back to the list price until the store answers.
    expect(screen.getByRole("button", { name: "Monthly · $3.99" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Get Plus yearly/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(purchase.reconcileEntitlements).toHaveBeenCalledWith("revenuecat");
    expect(track).toHaveBeenCalledWith("purchase_completed", { channel: "revenuecat", plan: "annual" });
    expect(screen.getByRole("status").textContent).toBe("You're Plus. Thank you!");
    expect(purchase.startCheckout).not.toHaveBeenCalled();
  });

  it("treats a dismissed store sheet as nothing happened", async () => {
    native.outcome = "cancelled";
    render(<PlusPurchaseControls account={{ signedIn: false, plus: false, plusRow: null, refreshEntitlements: refresh }} placement="sheet" />);
    fireEvent.click(screen.getByRole("button", { name: /Monthly/ }));
    await waitFor(() => expect(track).toHaveBeenCalledWith("checkout_started", expect.objectContaining({ plan: "monthly" })));
    await new Promise((r) => setTimeout(r, 0));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("restores purchases and says whether anything came back", async () => {
    purchase.reconcileEntitlements.mockResolvedValueOnce([row({ source: "revenuecat" })] as never);
    render(<PlusPurchaseControls account={{ signedIn: false, plus: false, plusRow: null, refreshEntitlements: refresh }} placement="sheet" />);
    fireEvent.click(screen.getByRole("button", { name: "Restore purchases" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Your Plus is back on this device."));
    expect(native.restore).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("purchase_restored");
    cleanup();
    purchase.reconcileEntitlements.mockResolvedValueOnce([] as never);
    render(<PlusPurchaseControls account={{ signedIn: false, plus: false, plusRow: null, refreshEntitlements: refresh }} placement="sheet" />);
    fireEvent.click(screen.getByRole("button", { name: "Restore purchases" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/No Plus purchase/));
  });

  it("offers a subscriber the store's management page, restore, and the sign-in prompt while anonymous", () => {
    render(
      <PlusPurchaseControls
        account={{ signedIn: false, plus: true, plusRow: row({ source: "revenuecat" }), refreshEntitlements: refresh }}
        placement="sheet"
        signInPrompt={<p>Sign in to keep it</p>}
      />,
    );
    expect(screen.getByRole("button", { name: "Manage in the store" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeTruthy();
    expect(screen.getByText("Sign in to keep it")).toBeTruthy();
  });
});
