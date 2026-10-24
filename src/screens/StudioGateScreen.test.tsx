// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import type { StudioAccount } from "../hooks/useStudioAccount";

const state: { account: StudioAccount; bypass: boolean } = { account: null as unknown as StudioAccount, bypass: false };
vi.mock("../hooks/useStudioAccount", () => ({ useStudioAccount: () => state.account }));
vi.mock("../lib/studioGate", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/studioGate")>()), studioGateBypassed: () => state.bypass }));
vi.mock("../routeModules", () => ({ screenModules: { studio: () => Promise.resolve({ StudioScreen: () => <h1>The editor</h1> }) } }));
vi.mock("../lib/account", () => ({ AUTH_PROVIDERS: ["apple", "google"], fetchEnabledProviders: async () => ({ apple: true, google: true }) }));
vi.mock("../lib/studioAuth", () => ({ resumeStudioSignIn: async () => null, signInToStudio: vi.fn(async () => {}) }));
const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

import { StudioGateScreen } from "./StudioGateScreen";

function account(over: Partial<StudioAccount>): StudioAccount {
  return { user: null, admin: false, ready: true, plus: false, plusReady: true, plusRow: null, refreshEntitlements: vi.fn(async () => {}), ...over };
}
const user = { id: "u1", is_anonymous: false } as StudioAccount["user"];
const renderGate = () =>
  render(
    <MemoryRouter initialEntries={["/studio"]}>
      <StudioGateScreen />
    </MemoryRouter>,
  );

beforeEach(() => {
  state.bypass = false;
  track.mockClear();
});
afterEach(cleanup);

describe("StudioGateScreen", () => {
  it("renders the editor for a Plus subscriber and for an admin (and in a bypass build) without a pitch", async () => {
    for (const a of [account({ user, plus: true }), account({ user, admin: true, plusReady: false })]) {
      state.account = a;
      renderGate();
      await waitFor(() => expect(screen.getByText("The editor")).toBeTruthy());
      expect(screen.queryByText("Build your own crossword")).toBeNull();
      cleanup();
    }
    state.bypass = true;
    state.account = account({ ready: false });
    renderGate();
    await waitFor(() => expect(screen.getByText("The editor")).toBeTruthy());
    expect(track).not.toHaveBeenCalled();
  });

  it("asks an anonymous visitor to sign in first, with the Plus pitch", () => {
    state.account = account({});
    renderGate();
    expect(screen.getByRole("heading", { name: "Build your own crossword" })).toBeTruthy();
    expect(screen.getByText(/Sign in first/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeTruthy();
    expect(screen.getByText("$24.99")).toBeTruthy();
    expect(screen.getByText("Save 48%")).toBeTruthy();
    expect(screen.queryByText("The editor")).toBeNull();
    expect(track).toHaveBeenCalledWith("paywall_viewed", { placement: "studio", feature: "studio", state: "sign-in" });
  });

  it("shows a free account the pitch without sign-in buttons", () => {
    state.account = account({ user });
    renderGate();
    expect(screen.getByText("Build your own crossword")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Get Plus yearly/ })).toBeTruthy();
    expect(track).toHaveBeenCalledWith("paywall_viewed", { placement: "studio", feature: "studio", state: "plus" });
  });

  it("shows nothing but a loading line until the session and entitlement are known", () => {
    state.account = account({ ready: false });
    renderGate();
    expect(screen.getByText("Loading the studio…")).toBeTruthy();
    cleanup();
    state.account = account({ user, plusReady: false });
    renderGate();
    expect(screen.getByText("Loading the studio…")).toBeTruthy();
    expect(track).not.toHaveBeenCalled();
  });
});
