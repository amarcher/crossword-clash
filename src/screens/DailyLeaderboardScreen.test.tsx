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

const fetchBoard = vi.fn<(day: string, slot: string) => Promise<RankedDailyEntry[]>>();
const updateName = vi.fn(async () => {});
// Production by default; a test flips it to a preview.
let postsHere = true;
vi.mock("../lib/dailyLeaderboard", async () => {
  const actual = await vi.importActual<typeof import("../lib/dailyLeaderboard")>("../lib/dailyLeaderboard");
  return {
    ...actual,
    fetchDailyLeaderboard: (day: string, slot: string) => fetchBoard(day, slot),
    updateDailyDisplayName: (...a: unknown[]) => updateName(...(a as [])),
    boardPostsHere: () => postsHere,
  };
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
// Every slot has a puzzle today unless a test says otherwise (null = nothing published).
let dailies: Record<string, typeof daily | null> = {};
vi.mock("../hooks/useDailyMini", () => ({ useDailyPuzzle: (slot: string) => dailies[slot] }));

/** Tailwind's lg breakpoint, as the screen asks matchMedia for it. */
const LG = "(min-width: 64rem)";
function wideViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: query === LG, addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

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

function pending(seconds: number, displayName = "Andy", posted = true): PendingDailyResult & { resolve: () => void } {
  const d = deferred();
  return {
    day: todayKey(),
    slot: "mini",
    entry: { userId: "me", displayName, mode: "solo", seconds },
    gameId: null,
    posted,
    settled: d.promise,
    resolve: d.resolve,
  };
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
  postsHere = true;
  dailies = { mini: daily, midi: getDailyMini(new Date(2026, 9, 21)), large: getDailyMini(new Date(2026, 9, 22)) };
  delete (window as { matchMedia?: unknown }).matchMedia;
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

  it("keeps an unsigned finish on this device and posts it under the name signed through the shared form", async () => {
    const p = pending(80, "Player", false);
    p.resolve();
    game.pendingDailyResult = p;
    renderBoard();
    await screen.findByText("Ada");
    // The viewer sees where the time would place, and is asked to post it.
    expect(screen.getAllByRole("row").map((r) => r.textContent)).toContainEqual(expect.stringContaining("2PlayerYou"));
    expect(screen.getByText("Add your name to post your time to today's board")).toBeTruthy();
    expect(screen.queryByText(/on today's board as/)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Andy" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(game.setPendingDailyResult).toHaveBeenCalledWith(
      expect.objectContaining({ posted: true, entry: expect.objectContaining({ userId: "me", displayName: "Andy", seconds: 80 }) }),
    );
    expect(updateName).not.toHaveBeenCalled();
    expect(game.setDisplayName).toHaveBeenCalledWith("Andy");
    expect(screen.getByText("On the board as Andy ✓")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
  });

  it("renames a row an older client posted under the default name", async () => {
    fetchBoard.mockResolvedValue(
      rankEntries([
        { userId: "a", displayName: "Ada", mode: "solo", seconds: 60 },
        { userId: "me", displayName: "Player", mode: "solo", seconds: 75 },
      ]),
    );
    renderBoard();
    await screen.findByText("Ada");
    expect(screen.getByText(/on today's board as “Player”/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Andy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateName).toHaveBeenCalledWith(todayKey(), "me", "Andy", "mini");
    expect(game.setPendingDailyResult).not.toHaveBeenCalled();
    expect(screen.getByText("On the board as Andy ✓")).toBeTruthy();
    expect(screen.getByText("Andy")).toBeTruthy();
  });

  it("on a preview the finish shows with a quiet note, and there is nothing to sign", async () => {
    postsHere = false;
    const p = pending(80, "Player", false);
    p.resolve();
    game.pendingDailyResult = p;
    renderBoard();
    await screen.findByText("Ada");
    expect(screen.getAllByRole("row").map((r) => r.textContent)).toContainEqual(expect.stringContaining("2PlayerYou"));
    expect(screen.getByTestId("board-not-posted").textContent).toBe("Preview: not posted to the board");
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(screen.getByTestId("solved-line").textContent).toBe("Solved in 1:20 · #2 today");
  });

  it("on a phone shows the route's one board", async () => {
    renderBoard();
    await screen.findByText("Ada");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Daily Leaderboard");
    expect(screen.queryByText("Daily Midi")).toBeNull();
    expect(fetchBoard).toHaveBeenCalledTimes(1);
    expect(fetchBoard).toHaveBeenCalledWith(todayKey(), "mini");
  });

  it("on a wide screen shows today's boards side by side, each fetched for its slot, the finish only in its own", async () => {
    wideViewport();
    const p = pending(90);
    p.resolve();
    game.pendingDailyResult = p;
    fetchBoard.mockImplementation(async (_day, slot) =>
      rankEntries([{ userId: `${slot}-1`, displayName: `${slot} leader`, mode: "solo", seconds: 60 }]),
    );
    renderBoard();
    await screen.findByText("large leader");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Today's Leaderboards");
    expect(screen.getByTestId("boards").className).toContain("lg:grid-cols-3");
    expect(["mini", "midi", "large"].map((s) => screen.getByTestId(`board-${s}`))).toHaveLength(3);
    expect(screen.getByText("Daily Mini")).toBeTruthy();
    expect(screen.getByText("Daily Midi")).toBeTruthy();
    expect(screen.getByText("Daily Large")).toBeTruthy();
    for (const slot of ["mini", "midi", "large"]) expect(fetchBoard).toHaveBeenCalledWith(todayKey(), slot);
    // The mini finish sits in the mini board only.
    expect(screen.getAllByText("Andy")).toHaveLength(1);
    expect(screen.getByTestId("board-mini").textContent).toContain("Andy");
    expect(screen.getByTestId("board-midi").textContent).not.toContain("Andy");
    expect(screen.getByTestId("board-mini").textContent).toContain("Solved in 1:30");
    expect(screen.getByTestId("board-large").textContent).toContain("Play Today's Large");
  });

  it("on a wide screen a slot with nothing published shows nothing", async () => {
    wideViewport();
    dailies = { ...dailies, large: null };
    renderBoard();
    await screen.findByText("Daily Midi");
    expect(screen.getByTestId("boards").className).toContain("lg:grid-cols-2");
    expect(screen.queryByTestId("board-large")).toBeNull();
    expect(screen.queryByText("Daily Large")).toBeNull();
    expect(fetchBoard).not.toHaveBeenCalledWith(todayKey(), "large");
  });
});
