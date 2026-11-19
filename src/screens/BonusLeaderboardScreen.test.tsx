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
const social = vi.hoisted(() => ({ streak: 0, friends: [] as { userId: string; username: string }[] }));
vi.mock("../hooks/useSolveHistory", () => ({ useBestTimes: () => best.value, useStreaks: () => ({ daily: social.streak, nyt: 0 }) }));
vi.mock("../contexts/FriendsContext", () => ({ useFriends: () => ({ active: social.friends.length > 0, friendships: { friends: social.friends, incoming: [], outgoing: [] } }) }));
vi.mock("../lib/friends", async (orig) => ({ ...(await orig<typeof import("../lib/friends")>()), friendsEnabled: () => true }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../components/PageShell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../components/ui/PlusBadge", () => ({ PlusBadge: () => null, PlusBadgeFor: () => null }));
const races = vi.hoisted(() => ({
  candidates: [] as { userId: string; username: string; seconds: number | null; friend: boolean }[],
  fetchFriendRace: vi.fn(),
  fetchOwnSolveTrace: vi.fn(async () => null),
  fetchSolveTrace: vi.fn(),
  saveRaceIntent: vi.fn(),
}));
vi.mock("../hooks/useRace", () => ({ useRaceCandidates: () => races.candidates }));
vi.mock("../hooks/useRaceName", () => ({ useRaceName: () => "archer" }));
vi.mock("../lib/friendRace", async (orig) => ({ ...(await orig<typeof import("../lib/friendRace")>()), fetchFriendRace: races.fetchFriendRace }));
vi.mock("../lib/race", async (orig) => ({ ...(await orig<typeof import("../lib/race")>()), fetchOwnSolveTrace: races.fetchOwnSolveTrace, fetchSolveTrace: races.fetchSolveTrace, saveRaceIntent: races.saveRaceIntent }));

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
  races.candidates = [];
  races.fetchFriendRace.mockReset();
  races.saveRaceIntent.mockClear();
  social.streak = 0;
  social.friends = [];
  localStorage.clear();
});
afterEach(cleanup);

describe("BonusLeaderboardScreen", () => {
  it("shows today's bonus times to a free player, with the pitch in place of Play", async () => {
    show();
    expect(await screen.findByText("alicia")).toBeTruthy();
    expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith(TODAY, "bonus", 50, null);
    expect(screen.getByText("Tempting Fate · Superstitions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock with Plus" }));
    expect(account.value.openPaywall).toHaveBeenCalledWith({ placement: "bonus-board", feature: "bonus", returnTo: "/bonus/leaderboard" });
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("has the streak and the Everyone / Friends filter of a daily's board", async () => {
    social.streak = 4;
    social.friends = [{ userId: "b", username: "sam" }];
    show();
    expect(await screen.findByText("alicia")).toBeTruthy();
    expect(screen.getByText("4-day streak")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    await waitFor(() => expect(board.fetchDailyLeaderboard).toHaveBeenLastCalledWith(TODAY, "bonus", 50, ["me", "b"]));
  });

  it("plays today's bonus for Plus", async () => {
    account.value = { ...account.value, plus: true };
    const puzzle = { title: "Tempting Fate", origin: "bonus" };
    bonus.loadBonusPuzzle.mockResolvedValue(puzzle);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Play today's Daily Plus" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(bonus.loadBonusPuzzle).toHaveBeenCalledWith(TODAY);
  });

  it("shows a past day's board as final, with a later solve slotted in where it would have placed", async () => {
    account.value = { ...account.value, plus: true };
    best.value = { "past-key": 360 };
    show("/bonus/leaderboard?day=2026-11-12");
    expect(await screen.findByText("Your 6:00 would have placed #2 of 3")).toBeTruthy();
    expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith("2026-11-12", "bonus", 50, null);
    expect(screen.getByText("Not on the board")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Play/ })).toBeNull();
  });

  it("plays a free player their friends' Daily Plus race as squares on the card's shape, never the puzzle, with the paywall behind every way in", async () => {
    races.candidates = [{ userId: "a", username: "alicia", seconds: null, friend: true }];
    // Even a server that sent letters: nothing of them reaches the page.
    races.fetchFriendRace.mockResolvedValue({ friends: [{ userId: "a", username: "alicia", seconds: 300, events: [[1000, 0, "Q"], [2000, 1, "Z"], [3000, 1, ""]] }], withLetters: true });
    show();
    await screen.findByText("alicia");
    // A row's Race is a way to solve it: the paywall.
    fireEvent.click(screen.getByRole("button", { name: /Race/ }));
    expect(account.value.openPaywall).toHaveBeenCalledWith({ placement: "bonus-board", feature: "bonus", returnTo: "/bonus/leaderboard" });
    expect(races.saveRaceIntent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("the-race"));
    const dialog = await screen.findByRole("dialog", { name: "alicia's solve" });
    expect(races.fetchFriendRace).toHaveBeenCalledWith("today-key");
    expect(screen.getByTestId("race-puzzle").textContent).toBe("Daily Plus · Nov 13 · Tempting Fate");
    expect(dialog.querySelectorAll("span.aspect-square")).toHaveLength(121);
    expect([...dialog.querySelectorAll("span.aspect-square")].map((c) => c.textContent).join("")).toBe("");
    expect(dialog.textContent).not.toMatch(/[QZ]/);
    expect(screen.queryAllByRole("gridcell")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("race-cta"));
    expect(account.value.openPaywall).toHaveBeenCalledTimes(2);
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("races a row for Plus by opening the puzzle with that player picked", async () => {
    account.value = { ...account.value, plus: true };
    races.candidates = [{ userId: "a", username: "alicia", seconds: 300, friend: false }];
    bonus.loadBonusPuzzle.mockResolvedValue({ title: "Tempting Fate", origin: "bonus" });
    show();
    await screen.findByText("alicia");
    fireEvent.click(screen.getByRole("button", { name: /Race/ }));
    expect(races.saveRaceIntent).toHaveBeenCalledWith({ key: "today-key", userIds: ["a"] });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
  });

  it("falls back to today for a day with no bonus, and steps back a day", async () => {
    show("/bonus/leaderboard?day=2026-10-01");
    await screen.findByText("alicia");
    expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith(TODAY, "bonus", 50, null);
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(board.fetchDailyLeaderboard).toHaveBeenCalledWith("2026-11-12", "bonus", 50, null));
    expect(await screen.findByText("Grounds for Arrest · Coffee")).toBeTruthy();
  });
});
