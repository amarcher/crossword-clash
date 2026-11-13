// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";

const stats = vi.hoisted(() => ({ fetchStats: vi.fn() }));
vi.mock("../lib/stats", async (orig) => ({ ...(await orig<typeof import("../lib/stats")>()), ...stats }));
const account = vi.hoisted(() => ({ value: { ready: true, plusReady: true, available: true, plus: false, openPaywall: vi.fn() } }));
vi.mock("../contexts/AccountContext", () => ({ useMaybeAccount: () => account.value }));
vi.mock("../hooks/useSolveHistory", () => ({ useSolveHistory: () => ({ rows: null, signedIn: false, loading: false, summary: null, failed: false }) }));
vi.mock("../components/PageShell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const { StatsScreen } = await import("./StatsScreen");

const renderPage = () => render(<MemoryRouter><StatsScreen /></MemoryRouter>);
afterEach(cleanup);

describe("StatsScreen", () => {
  it("shows a free player every card with blurred placeholder figures, asks the server nothing, and offers Plus", () => {
    renderPage();
    expect(screen.getByText("Faster than")).toBeTruthy();
    expect(screen.getByText("Head-to-head with friends")).toBeTruthy();
    expect(stats.fetchStats).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "See your stats with Plus" }));
    expect(account.value.openPaywall).toHaveBeenCalledWith({ placement: "stats", feature: "stats", returnTo: "/stats" });
  });

  it("shows a Plus player's own figures, per daily", async () => {
    account.value = { ...account.value, plus: true };
    stats.fetchStats.mockResolvedValue({
      results: [
        { day: "2026-11-09", slot: "mini", seconds: 60, solvers: 10, fasterThan: 0.5 },
        { day: "2026-11-10", slot: "mini", seconds: 90, solvers: 10, fasterThan: 0.7 },
        { day: "2026-11-10", slot: "large", seconds: 700, solvers: 5, fasterThan: 0.2 },
      ],
      headToHead: [{ friendId: "f", username: "alicia", played: 3, wins: 2, losses: 1, ties: 0 }],
      slowClues: [],
    });
    renderPage();
    expect(await screen.findByText("1:15")).toBeTruthy(); // the mini average
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("@alicia")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See your stats with Plus" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Daily Large" }));
    expect(screen.getAllByText("11:40").length).toBeGreaterThan(0);
  });
});
