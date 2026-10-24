// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { AccountSheet } from "./AccountSheet";
import type { AccountContextValue } from "../../contexts/AccountContext";

const deleteAccount = vi.fn();
vi.mock("../../lib/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/account")>()),
  deleteAccount: () => deleteAccount(),
}));
vi.mock("../../hooks/useSolveHistory", () => ({ useSolveHistory: () => ({ signedIn: true, summary: null, loading: true, failed: false }) }));

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
  openAccount: vi.fn(),
};

const renderSheet = () => render(<AccountSheet account={account} initialView="account" initialError={null} placement="test" onClose={vi.fn()} />);

afterEach(() => {
  cleanup();
  deleteAccount.mockReset();
});

describe("AccountSheet delete", () => {
  it("asks before deleting, and Cancel goes back", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("heading", { name: "Delete your account?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes on confirm and shows a failure", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("Couldn't reach the server"));
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't reach the server"));
  });
});
