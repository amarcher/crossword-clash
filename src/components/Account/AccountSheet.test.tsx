// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { User } from "@supabase/supabase-js";
import { AccountSheet } from "./AccountSheet";
import type { AccountContextValue } from "../../contexts/AccountContext";

const deleteAccount = vi.fn();
vi.mock("../../lib/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/account")>()),
  deleteAccount: () => deleteAccount(),
}));
const navigate = vi.fn();
vi.mock("../../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
const native = { available: false };
vi.mock("../../lib/nativePurchase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/nativePurchase")>()),
  nativePurchaseAvailable: () => native.available,
  purchasePlatform: () => (native.available ? "ios" : "web"),
  fetchNativePrices: async () => [],
}));

const user = { id: "u1", is_anonymous: false, user_metadata: { full_name: "Ada Lovelace" }, app_metadata: {}, aud: "authenticated", created_at: "" } as unknown as User;
const account: AccountContextValue = {
  user,
  profile: { user_id: "u1", username: "ada", display_name: null },
  ready: true,
  profileReady: true,
  available: true,
  setProfile: vi.fn(),
  plus: false,
  plusReady: true,
  entitlements: [],
  refreshEntitlements: vi.fn(async () => {}),
  plusRow: null,
  sessionUserId: null,
  openAccount: vi.fn(),
  openPaywall: vi.fn(),
};

const onClose = vi.fn();
const renderSheet = (view: "account" | "delete" | "plus" = "delete", overrides: Partial<AccountContextValue> = {}) =>
  render(
    <MemoryRouter>
      <AccountSheet account={{ ...account, ...overrides }} initialView={view} initialError={null} placement="test" onClose={onClose} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  deleteAccount.mockReset();
  onClose.mockClear();
  navigate.mockClear();
  native.available = false;
});

describe("AccountSheet delete", () => {
  it("asks before deleting, and Cancel closes the sheet", () => {
    renderSheet();
    expect(screen.getByRole("heading", { name: "Delete your account?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes on confirm and shows a failure", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("Couldn't reach the server"));
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't reach the server"));
  });
});

describe("AccountSheet Plus view", () => {
  it("shows the plan tiles to a non-subscriber and only the benefits + renewal line to a subscriber", () => {
    renderSheet("plus");
    expect(screen.getByText(/Save \d+%/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Get Plus yearly/ })).toBeTruthy();
    cleanup();
    const plusRow = {
      user_id: "u1",
      product: "plus" as const,
      source: "stripe" as const,
      status: "active" as const,
      expires_at: "2026-11-27T12:00:00Z",
      will_renew: true,
      external_id: "sub_1",
      external_customer: "cus_1",
      updated_at: "2026-10-27T00:00:00Z",
    };
    renderSheet("plus", { plus: true, plusRow });
    expect(screen.getByText(/Renews on November 27, 2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage subscription" })).toBeTruthy();
    expect(screen.queryByText(/Save \d+%/)).toBeNull();
    expect(screen.queryByText("per year")).toBeNull();
    expect(screen.queryByRole("button", { name: /Get Plus|Monthly/ })).toBeNull();
  });

  it("in the apps, asks an anonymous visitor to sign in before showing the plans", () => {
    native.available = true;
    renderSheet("plus", { user: null, profile: null });
    expect(screen.getByText(/Plus belongs to your account/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Get Plus|Monthly|Restore purchases/ })).toBeNull();
  });

  it("in the apps, still lets a subscriber who bought before sign-in-first manage and restore, with the sign-in prompt beneath", () => {
    native.available = true;
    const plusRow = {
      user_id: "anon",
      product: "plus" as const,
      source: "revenuecat" as const,
      status: "active" as const,
      expires_at: "2026-11-27T12:00:00Z",
      will_renew: true,
      external_id: "txn_1",
      external_customer: null,
      updated_at: "2026-10-28T00:00:00Z",
    };
    renderSheet("plus", { user: null, profile: null, plus: true, plusRow });
    expect(screen.getByRole("button", { name: "Manage in the store" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeTruthy();
    expect(screen.getByText(/Keep Plus on every device/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeTruthy();
  });
});

describe("AccountSheet signed in", () => {
  it("only points at the account page: nothing the page shows is repeated here", () => {
    renderSheet("account");
    expect(screen.getByRole("heading", { name: "ada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change username" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open your account" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/account");
  });
});
