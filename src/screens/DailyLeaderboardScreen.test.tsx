// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { DailyLeaderboardScreen } from "./DailyLeaderboardScreen";
import { rankEntries, todayKey, type PendingDailyResult, type RankedDailyEntry } from "../lib/dailyLeaderboard";
import { getDailyMini } from "../lib/dailyMinis";
import { puzzleIdentity } from "../lib/soloStats";

const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate, useParams: () => ({}) };
});

// A configured client, so the board takes the online path (the I/O itself is mocked below).
vi.mock("../lib/supabaseClient", () => ({ supabase: {} }));

const fetchBoard = vi.fn<() => Promise<RankedDailyEntry[]>>();
const updateName = vi.fn(async () => {});
vi.mock("../lib/dailyLeaderboard", async () => {
  const actual = await vi.importActual<typeof import("../lib/dailyLeaderboard")>("../lib/dailyLeaderboard");
  return { ...actual, fetchDailyLeaderboard: () => fetchBoard(), updateDailyDisplayName: (...a: unknown[]) => updateName(...(a as [])) };
});

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));

const game = {
  pendingDailyResult: null as PendingDailyResult | null,
  setPendingDailyResult: vi.fn(),
  setDisplayName: vi.fn(),
  setUrlPuzzle: vi.fn(),
  setSoloTheme: vi.fn(),
  handleSoloPuzzleLoaded: vi.fn(async () => {}),
};
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));

const daily = getDailyMini(new Date(2026, 9, 20));
vi.mock("../hooks/useDailyMini", () => ({ useDailyPuzzle: () => daily }));

let bestTimes: Record<string, number> = {};
vi.mock("../hooks/useSolveHistory", () => ({
  useStreaks: () => ({ daily: 0, nyt: 0 }),
  useBestTimes: () => bestTimes,
}));

vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function pending(seconds: number, displayName = "Andy"): PendingDailyResult & { resolve: () => void } {
  const d = deferred();
  return { day: todayKey(), slot: "mini", entry: { userId: "me", displayName, mode: "solo", seconds }, settled: d.promise, resolve: d.resolve };
}

function renderBoard() {
  return render(
    <MemoryRouter>
      <DailyLeaderboardScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  bestTimes = {};
  game.pendingDailyResult = null;
  fetchBoard.mockReset();
  fetchBoard.mockResolvedValue(rankEntries([{ userId: "a", displayName: "Ada", mode: "solo", seconds: 60 }]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DailyLeaderboardScreen", () => {
  it("waits for the pending submission before reading the board, showing the viewer's own row meanwhile", async () => {
    const p = pending(90);
    game.pendingDailyResult = p;
    renderBoard();

    // Own row at once, rank unknown, and no fetch yet.
    expect(screen.getByText("Andy")).toBeTruthy();
    expect(screen.getByText("1:30")).toBeTruthy();
    expect(screen.getByText("–")).toBeTruthy();
    expect(screen.getByText("Posting your time…")).toBeTruthy();
    expect(fetchBoard).not.toHaveBeenCalled();

    await act(async () => {
      p.resolve();
    });
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledTimes(1));
    // The server's board, with the own row merged and ranked.
    await screen.findByText("Ada");
    expect(screen.queryByText("Posting your time…")).toBeNull();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("1Ada"), expect.stringContaining("2Andy")]);
  });

  it("keeps the viewer's row when the fetch does not return it yet (the first finisher never sees an empty board)", async () => {
    const p = pending(75);
    p.resolve();
    game.pendingDailyResult = p;
    fetchBoard.mockResolvedValue([]);
    renderBoard();
    await waitFor(() => expect(fetchBoard).toHaveBeenCalled());
    expect(screen.queryByText(/No results yet today/)).toBeNull();
    expect(screen.getByText("Andy")).toBeTruthy();
    await screen.findByText("1");
  });

  it("marks a time made without autocheck with a chip", async () => {
    fetchBoard.mockResolvedValue(
      rankEntries([
        { userId: "a", displayName: "Ada", mode: "solo", seconds: 60, autocheck: false },
        { userId: "b", displayName: "Bo", mode: "solo", seconds: 70, autocheck: true },
      ]),
    );
    renderBoard();
    await screen.findByText("Ada");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("No autocheck");
    expect(rows[1].textContent).not.toContain("No autocheck");
  });

  it("refetches when the tab becomes visible again", async () => {
    renderBoard();
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledTimes(2));
  });

  it("solved today: shows the time and rank instead of the play button, and races a fresh puzzle through the picker", async () => {
    const p = pending(102);
    p.resolve();
    game.pendingDailyResult = p;
    renderBoard();
    await screen.findByText("Ada");
    expect(screen.getByTestId("solved-line").textContent).toBe("Solved in 1:42 · #2 today");
    expect(screen.queryByRole("button", { name: /Play Today's Mini/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Race friends live/ }));
    expect(navigate).toHaveBeenCalledWith("/pick-puzzle?intent=race");
    expect(game.setUrlPuzzle).not.toHaveBeenCalled();
  });

  it("solved on another day/device: a best time on record also counts", async () => {
    bestTimes = { [puzzleIdentity(daily.puzzle)]: 65 };
    renderBoard();
    await screen.findByText("Ada");
    expect(screen.getByTestId("solved-line").textContent).toBe("Solved in 1:05");
  });

  it("not solved: keeps the play button and races today's puzzle itself", async () => {
    renderBoard();
    await screen.findByText("Ada");
    expect(screen.queryByTestId("solved-line")).toBeNull();
    expect(screen.getByRole("button", { name: /Play Today's Mini/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Race friends live/ }));
    expect(game.setUrlPuzzle).toHaveBeenCalledWith(daily.puzzle);
    expect(navigate).toHaveBeenCalledWith("/host-game/name");
  });

  it("signs the board through the shared form and shows the name at once", async () => {
    const p = pending(80, "Player");
    p.resolve();
    game.pendingDailyResult = p;
    renderBoard();
    await screen.findByText("Ada");
    expect(screen.getByText(/on today's board as “Player”/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Andy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateName).toHaveBeenCalledWith(todayKey(), "me", "Andy", "mini");
    expect(game.setDisplayName).toHaveBeenCalledWith("Andy");
    expect(screen.getByText("On the board as Andy ✓")).toBeTruthy();
    expect(screen.getByText("Andy")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
  });
});
