// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import "../i18n/i18n";

const DAY = "2026-11-18";
const card = { day: DAY, title: "Tempting Fate", theme: "Superstitions", author: "Crossword Clash", width: 5, height: 5, blocks: ".".repeat(25), identity: "bonus-key" };
const bonus = vi.hoisted(() => ({ fetchBonusCard: vi.fn(), loadBonusPuzzle: vi.fn() }));
vi.mock("../lib/bonus", async (orig) => ({ ...(await orig<typeof import("../lib/bonus")>()), ...bonus }));
vi.mock("../lib/dailyLeaderboard", async (orig) => ({ ...(await orig<typeof import("../lib/dailyLeaderboard")>()), todayKey: () => "2026-11-18" }));
const account = vi.hoisted(() => ({ value: { available: true, plus: false, plusReady: true, openPaywall: vi.fn() } as { available: boolean; plus: boolean; plusReady: boolean; openPaywall: (o: unknown) => void } | null }));
vi.mock("../contexts/AccountContext", () => ({ useMaybeAccount: () => account.value }));
const game = vi.hoisted(() => ({ setUrlPuzzle: vi.fn(), setUrlChallenge: vi.fn() }));
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));
vi.mock("../components/Flow", () => ({
  FlowPage: ({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));
vi.mock("../components/ui/PlusBadge", () => ({ PlusBadge: () => null }));

const { BonusLinkScreen } = await import("./BonusLinkScreen");

function Where({ id }: { id: string }) {
  const location = useLocation();
  return <div data-testid={id}>{location.pathname + location.search}</div>;
}
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/bonus/leaderboard" element={<Where id="board" />} />
        <Route path="/bonus/:day" element={<BonusLinkScreen />} />
        <Route path="/challenge" element={<Where id="challenge" />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  bonus.fetchBonusCard.mockReset().mockResolvedValue(card);
  bonus.loadBonusPuzzle.mockReset().mockResolvedValue({ title: "Tempting Fate", origin: "bonus", bonusDay: DAY });
  account.value = { available: true, plus: false, plusReady: true, openPaywall: vi.fn() };
  game.setUrlPuzzle.mockClear();
  game.setUrlChallenge.mockClear();
});
afterEach(cleanup);

describe("BonusLinkScreen (/bonus/:day)", () => {
  it("shows a visitor without Plus who solved it, their time and their solve, and never loads the puzzle", async () => {
    show(`/bonus/${DAY}?beat=102&by=Archer&r=E0Gqr8Iw09i`);
    expect(await screen.findByRole("heading", { name: "Archer solved the Daily Plus" })).toBeTruthy();
    expect(screen.getByText("Nov 18 · Tempting Fate · Superstitions")).toBeTruthy();
    expect(screen.getByText("Archer solved it in 1:42")).toBeTruthy();
    const clip = screen.getByTestId("replay-preview").querySelector("video")!;
    expect(clip.getAttribute("src")).toContain("/api/replay?s=E0Gqr8Iw09i");
    expect(clip.getAttribute("aria-label")).toBe("Archer's solve, replayed");
    expect(screen.getByText("Daily Plus puzzles come with Crossword Clash Plus.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play this puzzle" }));
    expect(account.value!.openPaywall).toHaveBeenCalledWith({ placement: "bonus-link", feature: "bonus", returnTo: `/bonus/${DAY}?beat=102&by=Archer&r=E0Gqr8Iw09i` });
    expect(bonus.fetchBonusCard).toHaveBeenCalledWith(DAY);
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
    expect(game.setUrlPuzzle).not.toHaveBeenCalled();
  });

  it("is the same page without the clip when the link has no valid replay, or no account provider", async () => {
    account.value = null;
    show(`/bonus/${DAY}?beat=102&by=Archer&r=nope`);
    expect(await screen.findByRole("heading", { name: "Archer solved the Daily Plus" })).toBeTruthy();
    expect(screen.queryByTestId("replay-preview")).toBeNull();
    expect(screen.getByRole("button", { name: "Play this puzzle" })).toBeTruthy();
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("waits for the entitlement before deciding, fetching nothing", () => {
    account.value = { available: true, plus: false, plusReady: false, openPaywall: vi.fn() };
    show(`/bonus/${DAY}?beat=102&by=Archer`);
    expect(screen.getByRole("status").textContent).toContain("Daily Plus");
    expect(bonus.fetchBonusCard).not.toHaveBeenCalled();
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("hands Plus the puzzle and the sender's challenge, solved before or not (the challenge screen decides)", async () => {
    account.value = { available: true, plus: true, plusReady: true, openPaywall: vi.fn() };
    show(`/bonus/${DAY}?beat=102&by=Archer&r=E0Gqr8Iw09i`);
    await waitFor(() => expect(screen.getByTestId("challenge")).toBeTruthy());
    expect(bonus.loadBonusPuzzle).toHaveBeenCalledWith(DAY);
    expect(game.setUrlPuzzle).toHaveBeenCalledWith({ title: "Tempting Fate", origin: "bonus", bonusDay: DAY });
    expect(game.setUrlChallenge).toHaveBeenCalledWith({ name: "Archer", seconds: 102, replay: "E0Gqr8Iw09i", ref: { bonusDay: DAY } });
    expect(bonus.fetchBonusCard).not.toHaveBeenCalled();
  });

  it("sends Plus to the day's board when the link carries no time", async () => {
    account.value = { available: true, plus: true, plusReady: true, openPaywall: vi.fn() };
    show(`/bonus/${DAY}`);
    await waitFor(() => expect(screen.getByTestId("board").textContent).toBe("/bonus/leaderboard"));
    expect(game.setUrlChallenge).not.toHaveBeenCalled();
  });

  it("says so for a day with no Daily Plus, a puzzle Plus can't load, and a day to come", async () => {
    bonus.fetchBonusCard.mockResolvedValue(null);
    show("/bonus/2026-11-01?beat=102");
    expect((await screen.findByRole("heading")).textContent).toBe("No Daily Plus for Nov 1");
    cleanup();
    account.value = { available: true, plus: true, plusReady: true, openPaywall: vi.fn() };
    bonus.loadBonusPuzzle.mockResolvedValue(null);
    show(`/bonus/${DAY}?beat=102`);
    expect((await screen.findByRole("heading")).textContent).toBe("No Daily Plus for Nov 18");
    expect(game.setUrlPuzzle).not.toHaveBeenCalled();
    cleanup();
    bonus.loadBonusPuzzle.mockClear();
    show("/bonus/2026-11-19?beat=102");
    expect(screen.getByRole("heading").textContent).toBe("No Daily Plus for Nov 19");
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("is a not-found page for anything that isn't a day", () => {
    show("/bonus/tomorrow");
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(bonus.fetchBonusCard).not.toHaveBeenCalled();
  });
});
