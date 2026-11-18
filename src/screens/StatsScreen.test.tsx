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
  it("shows a free player their own real figures, a true line and a lock for each Plus one, and never a blurred or invented number", async () => {
    const today = new Date();
    const day = (ago: number) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    stats.fetchStats.mockResolvedValue({
      results: [
        { day: day(200), slot: "mini", seconds: 30, solvers: 9, fasterThan: null },
        { day: day(2), slot: "mini", seconds: 60, solvers: 10, fasterThan: null },
        { day: day(1), slot: "mini", seconds: 90, solvers: 1, fasterThan: null },
      ],
      headToHead: [{ friendId: "f", username: "alicia", played: 14, wins: null, losses: null, ties: null }],
      slowClues: [],
      slowClueCount: 6,
    });
    const { container } = renderPage();
    expect(await screen.findByText("1:00")).toBeTruthy(); // the average over the year, the old day included
    expect(stats.fetchStats).toHaveBeenCalledWith(expect.any(String), false);
    expect(screen.getByText("0:30")).toBeTruthy(); // the best
    expect(screen.getByText("3")).toBeTruthy(); // solved
    expect(screen.getByText("Ranked on 2 days. See how many solvers you beat.")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    // The chart covers the last 30 days only: its first date label is two days ago, not 200.
    expect(container.querySelectorAll('svg[aria-label="Your times"] rect').length).toBe(0); // no hover detail
    expect(screen.getByText(/Showing your last 30 days/)).toBeTruthy();
    expect(screen.getByText("See which weekday is your fastest.")).toBeTruthy();
    expect(container.querySelector('svg[aria-label="By weekday"]')).toBeNull();
    expect(screen.getByText("@alicia")).toBeTruthy();
    expect(screen.getByText("14 dailies")).toBeTruthy();
    expect(screen.getByText("6 clues took you over a minute. See which.")).toBeTruthy();
    expect(container.querySelector('[class*="blur"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /See which weekday/ }));
    expect(account.value.openPaywall).toHaveBeenCalledWith({ placement: "stats", feature: "stats", returnTo: "/stats" });
    fireEvent.click(screen.getByRole("button", { name: "See everything with Plus" }));
    expect(account.value.openPaywall).toHaveBeenCalledTimes(2);
  });

  it("tells a free player with nothing yet the truth: no chart, no teaser counts", async () => {
    stats.fetchStats.mockResolvedValue({ results: [], headToHead: [], slowClues: [], slowClueCount: 0 });
    renderPage();
    expect(await screen.findByText("Solve a daily to see your times here.")).toBeTruthy();
    expect(screen.getByText("Solve the same dailies as a friend to see who's ahead.")).toBeTruthy();
    expect(screen.queryByText(/Ranked on/)).toBeNull();
    expect(screen.queryByText(/took you over a minute/)).toBeNull();
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
      slowClueCount: null,
    });
    renderPage();
    expect(await screen.findByText("1:15")).toBeTruthy(); // the mini average
    expect(stats.fetchStats).toHaveBeenLastCalledWith(expect.any(String), true);
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("@alicia")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See everything with Plus" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Unlock/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Daily Large" }));
    expect(screen.getAllByText("11:40").length).toBeGreaterThan(0);
  });
});
