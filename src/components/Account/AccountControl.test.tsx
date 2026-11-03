// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { User } from "@supabase/supabase-js";
import "../../i18n/i18n";
import { AccountControl, avatarInitial } from "./AccountControl";
import type { AccountContextValue } from "../../contexts/AccountContext";

const context: { value: AccountContextValue | null } = { value: null };
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => context.value }));
const navigate = vi.fn();
vi.mock("../../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
const signOut = vi.fn(async () => {});
vi.mock("../../lib/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/account")>()),
  signOut: () => signOut(),
}));
const plusFlag = { on: false };
vi.mock("../../lib/plus", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/plus")>()), plusEnabled: () => plusFlag.on }));
vi.mock("../../routeModules", () => ({ prefetchRoute: vi.fn() }));
const friendsFlag = { on: true };
vi.mock("../../lib/friends", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/friends")>()), friendsEnabled: () => friendsFlag.on }));
const pending = { count: 0 };
vi.mock("../../contexts/FriendsContext", () => ({
  useFriends: () => ({ friendships: { friends: [], incoming: Array.from({ length: pending.count }, (_, i) => ({ userId: `r${i}`, username: `r${i}` })), outgoing: [] } }),
}));

const user = { id: "u1", is_anonymous: false, user_metadata: { full_name: "Ada Lovelace" }, app_metadata: { provider: "google" }, aud: "authenticated", created_at: "" } as unknown as User;

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

const renderControl = (path = "/menu") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AccountControl placement="test" />
    </MemoryRouter>,
  );

beforeEach(() => {
  context.value = account({});
  plusFlag.on = false;
  friendsFlag.on = true;
  pending.count = 0;
});
afterEach(() => {
  cleanup();
  navigate.mockClear();
  signOut.mockClear();
});

describe("avatarInitial", () => {
  it("takes the first character, upper-cased, and copes with empty names", () => {
    expect(avatarInitial("ada_l")).toBe("A");
    expect(avatarInitial("  émile")).toBe("É");
    expect(avatarInitial("")).toBe("?");
  });
});

describe("AccountControl", () => {
  it("renders nothing outside the provider, where accounts aren't offered, or before the session is known", () => {
    context.value = null;
    expect(renderControl().container.innerHTML).toBe("");
    cleanup();
    context.value = account({ available: false });
    expect(renderControl().container.innerHTML).toBe("");
    cleanup();
    context.value = account({ ready: false });
    expect(renderControl().container.innerHTML).toBe("");
  });

  it("offers a quiet Sign in to anonymous visitors that opens the sheet", () => {
    const openAccount = vi.fn();
    context.value = account({ openAccount });
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openAccount).toHaveBeenCalledWith({ placement: "test" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the username's initial and opens a menu of the account's actions", () => {
    const openAccount = vi.fn();
    context.value = account({ user, profile: { user_id: "u1", username: "ada_l", display_name: null }, openAccount });
    renderControl("/archive");
    const avatar = screen.getByRole("button", { name: "Account menu for ada_l" });
    expect(avatar.textContent).toBe("A");
    expect(avatar.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(avatar);
    const menu = screen.getByRole("menu");
    expect(avatar.getAttribute("aria-expanded")).toBe("true");
    expect(menu.textContent).toContain("ada_l");
    expect(menu.textContent).toContain("Ada Lovelace");
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Your account", "Past puzzles", "Friends", "Change username", "Sign out"]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Your account" }));
    expect(navigate).toHaveBeenCalledWith("/account");
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(avatar);
    fireEvent.click(screen.getByRole("menuitem", { name: "Past puzzles" }));
    expect(navigate).toHaveBeenCalledWith("/archive");

    fireEvent.click(avatar);
    fireEvent.click(screen.getByRole("menuitem", { name: "Change username" }));
    expect(openAccount).toHaveBeenCalledWith({ view: "username", placement: "test" });

    fireEvent.click(avatar);
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("has a Friends row that counts the requests waiting and lands on the friends screen, and none with the switch off", () => {
    context.value = account({ user, profile: { user_id: "u1", username: "ada_l", display_name: null } });
    pending.count = 2;
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "Account menu for ada_l" }));
    const row = screen.getByRole("menuitem", { name: "Friends · 2 requests waiting" });
    expect(row.textContent).toBe("Friends2");
    fireEvent.click(row);
    expect(navigate).toHaveBeenCalledWith("/race/friends");
    cleanup();

    pending.count = 0;
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "Account menu for ada_l" }));
    expect(screen.getByRole("menuitem", { name: "Friends" }).textContent).toBe("Friends");
    cleanup();

    friendsFlag.on = false;
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "Account menu for ada_l" }));
    expect(screen.queryByRole("menuitem", { name: /Friends/ })).toBeNull();
  });

  it("falls back to the provider name's initial and offers to choose a username", () => {
    context.value = account({ user });
    renderControl();
    const avatar = screen.getByRole("button", { name: "Account menu for Ada Lovelace" });
    expect(avatar.textContent).toBe("A");
    fireEvent.click(avatar);
    expect(screen.getByRole("menuitem", { name: "Choose a username" })).toBeTruthy();
    expect(screen.getByRole("menu").textContent).toContain("No username yet");
  });

  it("adds the Plus row only behind the launch switch: About Plus, or Manage subscription for a subscriber", () => {
    const openPaywall = vi.fn();
    context.value = account({ user, openPaywall });
    renderControl("/archive");
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(screen.queryByRole("menuitem", { name: /Plus/ })).toBeNull();
    cleanup();

    plusFlag.on = true;
    renderControl("/archive");
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "About Plus" }));
    expect(openPaywall).toHaveBeenCalledWith({ placement: "test", returnTo: "/archive" });
    cleanup();

    context.value = account({ user, plus: true, openPaywall });
    renderControl("/archive");
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(screen.getByRole("menuitem", { name: "Manage subscription" })).toBeTruthy();
  });

  it("closes on Escape (focus back on the avatar), on an outside tap, and moves focus with the arrow keys", () => {
    context.value = account({ user, profile: { user_id: "u1", username: "ada_l", display_name: null } });
    renderControl();
    const avatar = screen.getByRole("button", { name: /Account menu/ });
    fireEvent.click(avatar);
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(avatar);

    fireEvent.click(avatar);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
