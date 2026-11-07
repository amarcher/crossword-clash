// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "../../i18n/i18n";
import { PlusNudge } from "./PlusNudge";
import type { AccountContextValue } from "../../contexts/AccountContext";

const context: { value: AccountContextValue | null } = { value: null };
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => context.value }));
const plusFlag = { on: true };
vi.mock("../../lib/plus", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/plus")>()), plusEnabled: () => plusFlag.on }));

function account(overrides: Partial<AccountContextValue>): AccountContextValue {
  return {
    user: null,
    profile: null,
    ready: true,
    profileReady: true,
    sheetOpen: false,
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

const renderNudge = () => render(<PlusNudge title="Every daily, with Plus" body="The whole archive." placement="archive" feature="archive" returnTo="/archive" />);

beforeEach(() => {
  plusFlag.on = true;
  context.value = account({});
});
afterEach(cleanup);

describe("PlusNudge", () => {
  it("renders nothing with the switch off, outside the provider, where accounts aren't offered, before the session is known, or for a subscriber", () => {
    plusFlag.on = false;
    expect(renderNudge().container.innerHTML).toBe("");
    cleanup();
    plusFlag.on = true;
    for (const value of [null, account({ available: false }), account({ ready: false }), account({ plusReady: false }), account({ plus: true })]) {
      context.value = value;
      expect(renderNudge().container.innerHTML).toBe("");
      cleanup();
    }
  });

  it("pitches the benefit and opens the paywall with its placement, feature and return path", () => {
    const openPaywall = vi.fn();
    context.value = account({ openPaywall });
    renderNudge();
    expect(screen.getByText("Every daily, with Plus")).toBeTruthy();
    expect(screen.getByText("The whole archive.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "About Plus" }));
    expect(openPaywall).toHaveBeenCalledWith({ placement: "archive", feature: "archive", returnTo: "/archive" });
  });
});
