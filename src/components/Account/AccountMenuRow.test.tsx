// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { AccountMenuRow } from "./AccountMenuRow";
import type { AccountContextValue } from "../../contexts/AccountContext";

const context: { value: AccountContextValue } = { value: null as unknown as AccountContextValue };
vi.mock("../../contexts/AccountContext", () => ({ useAccountContext: () => context.value }));
const plus = { enabled: false };
vi.mock("../../lib/plus", () => ({ plusEnabled: () => plus.enabled }));

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
  plus.enabled = false;
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

  it("with Plus live, offers the subscription to anonymous visitors and opens the paywall", () => {
    plus.enabled = true;
    const openPaywall = vi.fn();
    context.value = account({ openPaywall });
    render(<AccountMenuRow />);
    const row = screen.getByRole("button", { name: /Crossword Clash Plus/ });
    expect(row.textContent).toContain("Every past daily");
    fireEvent.click(row);
    expect(openPaywall).toHaveBeenCalledWith({ placement: "menu" });
  });

  it("shows no Plus row while the switch is off, before entitlements are known, or to a Plus holder", () => {
    render(<AccountMenuRow />);
    expect(screen.queryByRole("button", { name: /Crossword Clash Plus/ })).toBeNull();
    cleanup();
    plus.enabled = true;
    context.value = account({ plusReady: false });
    render(<AccountMenuRow />);
    expect(screen.queryByRole("button", { name: /Crossword Clash Plus/ })).toBeNull();
    cleanup();
    context.value = account({ plus: true });
    render(<AccountMenuRow />);
    expect(screen.queryByRole("button", { name: /Crossword Clash Plus/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Save your solve history/ })).toBeTruthy();
  });
});
