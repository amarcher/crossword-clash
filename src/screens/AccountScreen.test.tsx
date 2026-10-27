// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { User } from "@supabase/supabase-js";
import "../i18n/i18n";
import { AccountScreen } from "./AccountScreen";
import type { AccountContextValue } from "../contexts/AccountContext";
import type { SolveRow } from "../lib/solveHistory";
import type { SoloProgressStore } from "../lib/soloProgress";
import type { DailyIndexEntry } from "../lib/dailyIndex";
import type { ClassicEntry } from "../lib/classicLibrary";
import type { Puzzle } from "../types/puzzle";

const navigate = vi.fn();
vi.mock("../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../routeModules", () => ({ prefetchOnIntent: () => ({}), prefetchRoute: vi.fn() }));

const context: { value: AccountContextValue } = { value: null as unknown as AccountContextValue };
vi.mock("../contexts/AccountContext", () => ({ useAccountContext: () => context.value, useMaybeAccount: () => context.value }));

const game = { handleSoloPuzzleLoaded: vi.fn(async () => {}), setSoloTheme: vi.fn() };
vi.mock("../contexts/GameContext", () => ({ useGame: () => game, loadSavedSession: () => null }));

let history: { signedIn: boolean; summary: { solveCount: number } | null; rows: SolveRow[] | null; loading: boolean; failed: boolean };
let streaks = { daily: 0, nyt: 0 };
let bestTimes: Record<string, number> = {};
vi.mock("../hooks/useSolveHistory", () => ({ useSolveHistory: () => history, useStreaks: () => streaks, useBestTimes: () => bestTimes }));

let store: SoloProgressStore = {};
vi.mock("../lib/soloProgress", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/soloProgress")>()), loadProgressStore: () => store }));
vi.mock("../lib/soloStats", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/soloStats")>()), loadSoloTimer: () => null }));

const puzzle = { title: "Game Night", width: 5, height: 5, cells: [], clues: [] } as unknown as Puzzle;
const dailies: DailyIndexEntry[] = [
  { day: "2026-10-20", slot: "mini", title: "Game Night", theme: "Board games", author: "", width: 5, height: 5, clues: 10, identity: "mini-id", blocks: "" },
];
const classics: ClassicEntry[] = [{ file: "cwpb1.puz", number: 1, title: "Puzzle No. 1", author: "", width: 11, height: 11, clues: 40, identity: "classic-id", blurb: "" }];
vi.mock("../lib/dailyIndex", () => ({ knownPublishedIndex: () => dailies, loadPublishedIndex: async () => dailies }));
const loadClassicPuzzle = vi.fn(async () => ({ ...puzzle, title: "Puzzle No. 1" }));
vi.mock("../lib/classicLibrary", () => ({ knownClassicManifest: () => classics, loadClassicManifest: async () => classics, loadClassicPuzzle: () => loadClassicPuzzle() }));
const fetchDailyForDay = vi.fn(async () => ({ puzzle, theme: "Board games" }));
vi.mock("../lib/dailyFeed", () => ({ fetchDailyForDay: (...args: unknown[]) => fetchDailyForDay(...(args as [])) }));

const plusFlag = { on: false };
vi.mock("../lib/plus", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/plus")>()), plusEnabled: () => plusFlag.on }));
vi.mock("../components/Plus/PlusPurchaseControls", () => ({ PlusPurchaseControls: () => <div data-testid="purchase-controls">Renews on…</div> }));
const signOut = vi.fn(async () => {});
vi.mock("../lib/account", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/account")>()), signOut: () => signOut() }));

const user = { id: "u1", is_anonymous: false, user_metadata: { full_name: "Ada Lovelace" }, app_metadata: { provider: "google" }, aud: "authenticated", created_at: "" } as unknown as User;

function account(overrides: Partial<AccountContextValue>): AccountContextValue {
  return {
    user,
    profile: { user_id: "u1", username: "ada_l", display_name: null },
    ready: true,
    profileReady: true,
    available: true,
    setProfile: vi.fn(),
    plus: false,
    plusReady: true,
    entitlements: [],
    refreshEntitlements: vi.fn(async () => {}),
    plusRow: null,
    sessionUserId: "u1",
    openAccount: vi.fn(),
    openPaywall: vi.fn(),
    ...overrides,
  };
}

const solve = (over: Partial<SolveRow>): SolveRow => ({
  puzzle_key: "k",
  title: "T",
  source: "daily",
  mode: "solo",
  seconds: 102,
  completed_day: "2026-10-20",
  completed_at: "2026-10-20T10:00:00Z",
  ...over,
});

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={["/account"]}>
      <AccountScreen />
    </MemoryRouter>,
  );

beforeEach(() => {
  context.value = account({});
  history = { signedIn: true, summary: { solveCount: 7 }, rows: [], loading: false, failed: false };
  streaks = { daily: 3, nyt: 0 };
  bestTimes = {};
  store = {};
  plusFlag.on = false;
});
afterEach(() => {
  cleanup();
  navigate.mockClear();
  game.handleSoloPuzzleLoaded.mockClear();
  game.setSoloTheme.mockClear();
  fetchDailyForDay.mockClear();
  loadClassicPuzzle.mockClear();
  signOut.mockClear();
});

describe("AccountScreen (/account)", () => {
  it("sends an anonymous visitor to the menu with the sign-in sheet open", () => {
    const openAccount = vi.fn();
    context.value = account({ user: null, profile: null, openAccount });
    renderScreen();
    expect(navigate).toHaveBeenCalledWith("/menu", { replace: true });
    expect(openAccount).toHaveBeenCalledWith({ placement: "account-page" });
    expect(screen.queryByText("ada_l")).toBeNull();
  });

  it("waits for the session before deciding, and offers nothing where accounts aren't available", () => {
    context.value = account({ ready: false, user: null });
    renderScreen();
    expect(navigate).not.toHaveBeenCalled();
    cleanup();
    const openAccount = vi.fn();
    context.value = account({ available: false, openAccount });
    renderScreen();
    expect(navigate).toHaveBeenCalledWith("/menu", { replace: true });
    expect(openAccount).not.toHaveBeenCalled();
  });

  it("shows who is signed in, the overview numbers, and the username picker on Change username", () => {
    const openAccount = vi.fn();
    context.value = account({ openAccount });
    renderScreen();
    expect(screen.getByText("ada_l")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Signed in with Google")).toBeTruthy();
    expect(screen.getByText("Daily streak").parentElement!.parentElement!.textContent).toContain("3 days");
    expect(screen.getByText("Solves synced").parentElement!.parentElement!.textContent).toContain("7");
    fireEvent.click(screen.getByRole("button", { name: "Change username" }));
    expect(openAccount).toHaveBeenCalledWith({ view: "username", placement: "account-page" });
    expect(screen.queryByText("Crossword Clash Plus")).toBeNull();
  });

  it("lists recent solves newest first with date, time and source, and links the archive", () => {
    history.rows = [
      solve({ puzzle_key: "a", title: "Old One", completed_day: "2026-10-18", completed_at: "2026-10-18T10:00:00Z", source: "other", mode: "import" }),
      solve({ puzzle_key: "legacy:daily:2026-10-19", title: "", mode: "import", seconds: null, completed_day: "2026-10-19", completed_at: "2026-10-19T10:00:00Z" }),
      solve({ puzzle_key: "b", title: "Game Night", seconds: 17 }),
      solve({ puzzle_key: "c", title: "Big Race", source: "nyt", mode: "versus", seconds: null, completed_day: "2026-10-21", completed_at: "2026-10-21T10:00:00Z" }),
    ];
    renderScreen();
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("p")!.textContent)).toEqual(["Big Race", "Game Night", "Old One"]);
    expect(items[0].textContent).toContain("NYT");
    expect(items[0].textContent).toContain("Solved");
    expect(items[1].textContent).toContain("0:17");
    expect(items[1].textContent).toContain("Daily");
    expect(items[1].textContent).toContain("Oct 20");
    expect(items[2].textContent).toContain("1:42");
    expect(screen.getByRole("link", { name: /All past puzzles/ }).getAttribute("href")).toBe("/archive");
  });

  it("explains an empty, loading or failed history", () => {
    renderScreen();
    expect(screen.getByText(/No solves yet/)).toBeTruthy();
    cleanup();
    history = { signedIn: true, summary: null, rows: null, loading: true, failed: false };
    renderScreen();
    expect(screen.getByText("Loading your solves…")).toBeTruthy();
    cleanup();
    history = { signedIn: true, summary: null, rows: null, loading: false, failed: true };
    renderScreen();
    expect(screen.getByText(/couldn't be loaded/)).toBeTruthy();
  });

  it("lists the puzzles in progress by name and resumes one on the daily path", async () => {
    store = {
      "mini-id": { key: "mini-id", cells: {}, elapsedMs: 61_000, updatedAt: 20, filled: 2, total: 21 },
      "classic-id": { key: "classic-id", cells: {}, elapsedMs: 5_000, updatedAt: 10, filled: 1, total: 80 },
      "unknown-id": { key: "unknown-id", cells: {}, elapsedMs: 1, updatedAt: 30, filled: 1, total: 9 },
    };
    renderScreen();
    const section = screen.getByRole("region", { name: "In progress" }) ?? screen.getByText("In progress").closest("section")!;
    const resumes = within(section).getAllByRole("button", { name: /Resume/ });
    expect(resumes).toHaveLength(2);
    expect(section.textContent).toContain("Game Night");
    expect(section.textContent).toContain("2 of 21 filled · 1:01");
    expect(section.textContent).toContain("Puzzle No. 1");
    expect(section.textContent).toContain("Classic");
    expect(section.textContent.indexOf("Game Night")).toBeLessThan(section.textContent.indexOf("Puzzle No. 1"));

    fireEvent.click(resumes[0]);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(fetchDailyForDay).toHaveBeenCalledWith("2026-10-20", "mini");
    expect(game.handleSoloPuzzleLoaded).toHaveBeenCalledWith(puzzle);
    expect(game.setSoloTheme).toHaveBeenCalledWith("Board games");
  });

  it("resumes a classic through the library loader, and a solved puzzle's record is not listed", async () => {
    store = {
      "mini-id": { key: "mini-id", cells: {}, elapsedMs: 61_000, updatedAt: 20, filled: 2, total: 21 },
      "classic-id": { key: "classic-id", cells: {}, elapsedMs: 5_000, updatedAt: 10, filled: 1, total: 80 },
    };
    bestTimes = { "mini-id": 90 };
    renderScreen();
    const section = screen.getByText("In progress").closest("section")!;
    expect(section.textContent).not.toContain("Game Night");
    fireEvent.click(within(section).getByRole("button", { name: /Resume/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(loadClassicPuzzle).toHaveBeenCalledTimes(1);
    expect(game.setSoloTheme).toHaveBeenCalledWith(null);
  });

  it("shows the Plus card only behind the launch switch: the pitch, or the subscriber controls", () => {
    plusFlag.on = true;
    const openPaywall = vi.fn();
    context.value = account({ openPaywall });
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "About Plus" }));
    expect(openPaywall).toHaveBeenCalledWith({ placement: "account-page", returnTo: "/account" });
    expect(screen.queryByTestId("purchase-controls")).toBeNull();
    cleanup();
    context.value = account({ plus: true });
    renderScreen();
    expect(screen.getByTestId("purchase-controls")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "About Plus" })).toBeNull();
  });

  it("signs out without reopening the sheet, and Delete account opens the confirm", () => {
    const openAccount = vi.fn();
    context.value = account({ openAccount });
    const view = renderScreen();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete account" })[0]);
    expect(openAccount).toHaveBeenCalledWith({ view: "delete", placement: "account-page" });
    fireEvent.click(screen.getAllByRole("button", { name: "Sign out" })[0]);
    expect(signOut).toHaveBeenCalledTimes(1);
    // The session is gone: back to the menu, and no sign-in sheet for someone who just left.
    openAccount.mockClear();
    context.value = account({ user: null, profile: null, openAccount });
    view.rerender(
      <MemoryRouter initialEntries={["/account"]}>
        <AccountScreen />
      </MemoryRouter>,
    );
    expect(navigate).toHaveBeenCalledWith("/menu", { replace: true });
    expect(openAccount).not.toHaveBeenCalled();
  });
});
