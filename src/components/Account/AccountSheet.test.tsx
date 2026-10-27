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
const renderSheet = (view: "account" | "delete" = "delete") =>
  render(
    <MemoryRouter>
      <AccountSheet account={account} initialView={view} initialError={null} placement="test" onClose={onClose} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  deleteAccount.mockReset();
  onClose.mockClear();
  navigate.mockClear();
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
