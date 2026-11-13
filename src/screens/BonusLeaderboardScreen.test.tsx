// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";

const TODAY = "2026-11-13";
const cards = [
  { day: TODAY, title: "Tempting Fate", theme: "Superstitions", author: "Crossword Clash", width: 11, height: 11, blocks: ".".repeat(121), identity: "today-key" },
  { day: "2026-11-12", title: "Grounds for Arrest", theme: "Coffee", author: "Crossword Clash", width: 11, height: 11, blocks: ".".repeat(121), identity: "past-key" },
];
const bonus = vi.hoisted(() => ({ fetchBonusCards: vi.fn(), loadBonusPuzzle: vi.fn() }));
vi.mock("../lib/bonus", async (orig) => ({ ...(await orig<typeof import("../lib/bonus")>()), ...bonus }));
const board = vi.hoisted(() => ({ fetchDailyLeaderboard: vi.fn(), todayKey: () => "2026-11-13" }));
vi.mock("../lib/dailyLeaderboard", async (orig) => ({ ...(await orig<typeof import("../lib/dailyLeaderboard")>()), ...board }));
vi.mock("../lib/supabaseClient", () => ({ supabase: {} }));
const account = vi.hoisted(() => ({ value: { available: true, plus: false, plusReady: true, openPaywall: vi.fn() } }));
vi.mock("../contexts/AccountContext", () => ({ useMaybeAccount: () => account.value }));
const game = vi.hoisted(() => ({ handleSoloPuzzleLoaded: vi.fn(async () => true), setSoloTheme: vi.fn(), pendingDailyResult: null, displayName: "archer" }));
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
const best = vi.hoisted(() => ({ value: {} as Record<string, number> }));
vi.mock("../hooks/useSolveHistory", () => ({ useBestTimes: () => best.value }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../components/PageShell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../components/ui/PlusBadge", () => ({ PlusBadge: () => null, PlusBadgeFor: () => null }));

const { BonusLeaderboardScreen } = await import("./BonusLeaderboardScreen");

const row = (userId: string, displayName: string, seconds: number, rank: number) => ({ userId, displayName, mode: "solo" as const, seconds, autocheck: true, rank });
const show = (path = "/bonus/leaderboard") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BonusLeaderboardScreen />
    </MemoryRouter>,
  );

beforeEach(() => {
  bonus.fetchBonusCards.mockResolvedValue(cards);
  bonus.loadBonusPuzzle.mockReset();
  board.fetchDailyLeaderboard.mockReset().mockResolvedValue([row("a", "alicia", 300, 1), row("b", "sam", 420, 2)]);
  account.value = { available: true, plus: false, plusReady: true, openPaywall: vi.fn() };
  best.value = {};
  navigate.mockClear();
});
afterEach(cleanup);

describe("BonusLeaderboardScreen", () => {
  it("shows today's bonus times to a free player, with the pitch in place of Play", async () => {
    show();
    expect(await screen.findByText("alicia")).toBeTruthy();
    expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith(TODAY, "bonus");
    expect(screen.getByText("Tempting Fate · Superstitions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock with Plus" }));
    expect(account.value.openPaywall).toHaveBeenCalledWith({ placement: "bonus-board", feature: "bonus", returnTo: "/bonus/leaderboard" });
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("plays today's bonus for Plus", async () => {
    account.value = { ...account.value, plus: true };
    const puzzle = { title: "Tempting Fate", origin: "bonus" };
    bonus.loadBonusPuzzle.mockResolvedValue(puzzle);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Play today's bonus" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(bonus.loadBonusPuzzle).toHaveBeenCalledWith(TODAY);
  });

  it("shows a past day's board as final, with a later solve slotted in where it would have placed", async () => {
    account.value = { ...account.value, plus: true };
    best.value = { "past-key": 360 };
    show("/bonus/leaderboard?day=2026-11-12");
    expect(await screen.findByText("Your 6:00 would have placed #2 of 3")).toBeTruthy();
    expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith("2026-11-12", "bonus");
    expect(screen.getByText("Not on the board")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Play/ })).toBeNull();
  });

  it("falls back to today for a day with no bonus, and steps back a day", async () => {
    show("/bonus/leaderboard?day=2026-10-01");
    await screen.findByText("alicia");
    expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith(TODAY, "bonus");
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith("2026-11-12", "bonus"));
    expect(await screen.findByText("Grounds for Arrest · Coffee")).toBeTruthy();
  });
});
