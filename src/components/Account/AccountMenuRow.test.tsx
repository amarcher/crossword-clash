// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { AccountMenuRow } from "./AccountMenuRow";
import type { AccountContextValue } from "../../contexts/AccountContext";

const context: { value: AccountContextValue } = { value: null as unknown as AccountContextValue };
vi.mock("../../contexts/AccountContext", () => ({ useAccountContext: () => context.value }));

const user = { id: "u1", is_anonymous: false, user_metadata: { full_name: "Ada Lovelace" }, app_metadata: {}, aud: "authenticated", created_at: "" } as unknown as User;

function account(overrides: Partial<AccountContextValue>): AccountContextValue {
  return {
    user: null,
    profile: null,
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
    ...overrides,
  };
}

beforeEach(() => {
  context.value = account({});
});
afterEach(cleanup);

describe("AccountMenuRow", () => {
  it("renders nothing where accounts aren't offered, or before the session is known", () => {
    context.value = account({ available: false });
    expect(render(<AccountMenuRow />).container.innerHTML).toBe("");
    cleanup();
    context.value = account({ ready: false });
    expect(render(<AccountMenuRow />).container.innerHTML).toBe("");
  });

  it("pitches a benefit to anonymous visitors and opens the sheet on tap", () => {
    const openAccount = vi.fn();
    context.value = account({ openAccount });
    render(<AccountMenuRow />);
    const row = screen.getByRole("button", { name: /Save your solve history/ });
    expect(row.textContent).toContain("Optional");
    fireEvent.click(row);
    expect(openAccount).toHaveBeenCalledWith({ placement: "menu" });
  });

  it("goes away once signed in: the header avatar covers the account", () => {
    context.value = account({ user, profile: { user_id: "u1", username: "ada_l", display_name: null } });
    expect(render(<AccountMenuRow />).container.innerHTML).toBe("");
    cleanup();
    context.value = account({ user });
    expect(render(<AccountMenuRow />).container.innerHTML).toBe("");
  });
});
