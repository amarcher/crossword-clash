// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";

const card = { day: "2026-11-13", title: "Grounds for Arrest", theme: "Coffee", author: "Crossword Clash", width: 3, height: 3, blocks: "#........", identity: "abc" };
const bonus = vi.hoisted(() => ({ fetchBonusCard: vi.fn(), loadBonusPuzzle: vi.fn() }));
vi.mock("../../lib/bonus", async (orig) => ({ ...(await orig<typeof import("../../lib/bonus")>()), ...bonus }));
const account = vi.hoisted(() => ({ value: { available: true, plus: false, openPaywall: vi.fn() } }));
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => account.value }));
const game = vi.hoisted(() => ({ handleSoloPuzzleLoaded: vi.fn(async () => true), setSoloTheme: vi.fn() }));
vi.mock("../../contexts/GameContext", () => ({ useGame: () => game }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
vi.mock("../../hooks/useSolveHistory", () => ({ useBestTimes: () => ({}) }));
vi.mock("../../lib/plus", async (orig) => ({ ...(await orig<typeof import("../../lib/plus")>()), plusEnabled: () => true }));
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));

const { BonusCard } = await import("./BonusCard");

beforeEach(() => {
  bonus.fetchBonusCard.mockResolvedValue(card);
  bonus.loadBonusPuzzle.mockReset();
  navigate.mockClear();
});
afterEach(cleanup);

describe("BonusCard", () => {
  it("shows today's bonus to everyone, and a free player gets the pitch instead of the puzzle", async () => {
    render(<BonusCard />, { wrapper: MemoryRouter });
    expect(await screen.findByText("Grounds for Arrest")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock with Plus" }));
    expect(account.value.openPaywall).toHaveBeenCalledWith({ placement: "bonus", feature: "bonus" });
    expect(bonus.loadBonusPuzzle).not.toHaveBeenCalled();
  });

  it("loads and plays it for Plus", async () => {
    account.value = { ...account.value, plus: true };
    const puzzle = { title: "Grounds for Arrest", origin: "bonus" };
    bonus.loadBonusPuzzle.mockResolvedValue(puzzle);
    render(<BonusCard />, { wrapper: MemoryRouter });
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(bonus.loadBonusPuzzle).toHaveBeenCalledWith("2026-11-13");
    expect(game.handleSoloPuzzleLoaded).toHaveBeenCalledWith(puzzle);
    expect(game.setSoloTheme).toHaveBeenCalledWith("Coffee");
  });

  it("says so when the bonus can't be loaded, and renders nothing on a day without one", async () => {
    bonus.loadBonusPuzzle.mockResolvedValue(null);
    const { unmount } = render(<BonusCard />, { wrapper: MemoryRouter });
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    unmount();
    bonus.fetchBonusCard.mockResolvedValue(null);
    const { container } = render(<BonusCard />, { wrapper: MemoryRouter });
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });
});
