// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { ArchiveScreen } from "./ArchiveScreen";
import { indexEntryFor, resetDailyIndexMemory, type DailyIndexEntry } from "../lib/dailyIndex";
import { parseDailyFeedEntry } from "../lib/dailyFeed";
import { longDay, monthOf, toDate, fromDate } from "../lib/archive";
import { dayKey, formatDuration } from "../lib/soloStats";
import type { TransferPuzzle } from "../lib/puzzleNormalizer";
import type { Puzzle } from "../types/puzzle";

const navigate = vi.fn();
vi.mock("../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

const game = {
  handleSoloPuzzleLoaded: vi.fn(async () => {}),
  setSoloTheme: vi.fn(),
  setUrlPuzzle: vi.fn(),
};
let savedSession: { puzzle: Puzzle; playerCells: Record<string, unknown>; gameId: null } | null = null;
vi.mock("../contexts/GameContext", () => ({ useGame: () => game, loadSavedSession: () => savedSession }));

let bestTimes: Record<string, number> = {};
vi.mock("../hooks/useSolveHistory", () => ({ useBestTimes: () => bestTimes }));

// null = no AccountProvider (nothing locked); set per test to gate.
const openAccount = vi.fn();
let accountState: { available: boolean; ready: boolean; user: { id: string } | null; openAccount: typeof openAccount } | null = null;
vi.mock("../contexts/AccountContext", () => ({ useMaybeAccount: () => accountState }));

function transfer(title: string, theme: string): { theme: string; puzzle: TransferPuzzle } {
  return {
    theme,
    puzzle: {
      title,
      author: "Crossword Clash",
      size: { rows: 3, cols: 3 },
      grid: ["C", "A", "T", "A", ".", "O", "B", "E", "T"],
      gridnums: [1, 0, 2, 0, 0, 0, 3, 0, 0],
      clues: { across: ["1. Feline", "3. Wager"], down: ["1. Taxi", "2. Digit"] },
      answers: { across: ["CAT", "BET"], down: ["CAB", "TOT"] },
    },
  };
}

const today = dayKey(new Date());
const shift = (n: number) => {
  const d = toDate(today);
  d.setDate(d.getDate() + n);
  return fromDate(d);
};
const yesterday = shift(-1);
const tomorrow = shift(1);
const lastWeek = shift(-8);

const FEEDS = {
  [`/daily-puzzles/${today}.json`]: transfer("Movie Night", "Movies"),
  [`/daily-puzzles/midi/${today}.json`]: transfer("Bard on Screen", "Shakespeare"),
  [`/daily-puzzles/large/${yesterday}.json`]: transfer("Split Decision", "Ocean"),
  [`/daily-puzzles/${lastWeek}.json`]: transfer("Old News", "Papers"),
  [`/daily-puzzles/${tomorrow}.json`]: transfer("Not Yet", "Future"),
};
const dailies = Object.fromEntries(Object.entries(FEEDS).map(([k, v]) => [k, parseDailyFeedEntry(v)!]));
const entries: DailyIndexEntry[] = [
  indexEntryFor(today, "mini", dailies[`/daily-puzzles/${today}.json`]),
  indexEntryFor(today, "midi", dailies[`/daily-puzzles/midi/${today}.json`]),
  indexEntryFor(yesterday, "large", dailies[`/daily-puzzles/large/${yesterday}.json`]),
  indexEntryFor(lastWeek, "mini", dailies[`/daily-puzzles/${lastWeek}.json`]),
  indexEntryFor(tomorrow, "mini", dailies[`/daily-puzzles/${tomorrow}.json`]),
];
const months = [...new Set([monthOf(lastWeek), monthOf(yesterday), monthOf(today), monthOf(tomorrow)])].sort();

let indexDown = false;
const fetched: string[] = [];

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/archive"]}>
      <ArchiveScreen />
    </MemoryRouter>,
  );
}

describe("ArchiveScreen (/archive)", () => {
  beforeEach(() => {
    fetched.length = 0;
    indexDown = false;
    bestTimes = {};
    savedSession = null;
    accountState = null;
    openAccount.mockClear();
    resetDailyIndexMemory();
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      if (url === "/daily-puzzles/index.json") {
        return indexDown ? { ok: false, status: 500, json: async () => null } : { ok: true, status: 200, json: async () => ({ first: yesterday, last: tomorrow, months }) };
      }
      const month = /\/daily-puzzles\/index\/(\d{4}-\d{2})\.json$/.exec(url)?.[1];
      if (month) return { ok: true, status: 200, json: async () => entries.filter((e) => monthOf(e.day) === month) };
      const feed = FEEDS[url as keyof typeof FEEDS];
      return { ok: !!feed, status: feed ? 200 : 404, json: async () => feed ?? null };
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    navigate.mockClear();
    game.handleSoloPuzzleLoaded.mockClear();
    game.setSoloTheme.mockClear();
    game.setUrlPuzzle.mockClear();
  });

  it("opens on today, shows each daily's status, and never lists a future day", async () => {
    bestTimes = { [entries[0].identity]: 102 };
    renderScreen();
    await waitFor(() => expect(screen.getByText("Movie Night")).toBeTruthy());
    // Only the months that have started were fetched; tomorrow's entry is filtered out.
    expect(fetched.filter((u) => u.includes("/index/")).every((u) => u <= `/daily-puzzles/index/${monthOf(today)}.json`)).toBe(true);
    expect(screen.queryByText("Not Yet")).toBeNull();
    expect(screen.getByText("1 of 4 solved · 3 to catch up on")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: new RegExp(longDay(today, "en")) })).toBeTruthy();
    expect(screen.getByText(formatDuration(102))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    const cell = screen.getByRole("button", { name: new RegExp(`^${longDay(today, "en")}:`) });
    expect(cell.getAttribute("aria-current")).toBe("date");
    expect(cell.getAttribute("aria-label")).toContain(`Daily Mini solved in ${formatDuration(102)}`);
    expect(cell.getAttribute("aria-label")).toContain("Daily Midi unsolved");
  });

  it("picking another day lists it, and Play loads that day's puzzle straight into solo play", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Movie Night")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${longDay(yesterday, "en")}:`) }));
    expect(screen.getByText("Split Decision")).toBeTruthy();
    expect(screen.queryByText("Movie Night")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(fetched).toContain(`/daily-puzzles/large/${yesterday}.json`);
    expect(game.handleSoloPuzzleLoaded).toHaveBeenCalledTimes(1);
    expect((game.handleSoloPuzzleLoaded.mock.calls[0] as unknown[])[0]).toMatchObject({ title: "Split Decision" });
    expect(game.setSoloTheme).toHaveBeenCalledWith("Ocean");
  });

  it("Race hands the day's puzzle to the host flow", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Bard on Screen")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Race a friend on Bard on Screen" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/host-game/name"));
    expect(game.setUrlPuzzle).toHaveBeenCalledTimes(1);
    expect(game.setUrlPuzzle.mock.calls[0][0]).toMatchObject({ title: "Bard on Screen" });
    expect(game.handleSoloPuzzleLoaded).not.toHaveBeenCalled();
  });

  it("offers to resume the saved solo game and marks it in progress", async () => {
    savedSession = { puzzle: dailies[`/daily-puzzles/midi/${today}.json`].puzzle, playerCells: { "0,0": { letter: "C", correct: true } }, gameId: null };
    renderScreen();
    // The title appears twice: in the resume card and in today's list.
    await waitFor(() => expect(screen.getAllByText("Bard on Screen")).toHaveLength(2));
    const card = screen.getByRole("region", { name: "Pick up where you left off" });
    expect(within(card).getByText("Bard on Screen")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Resume" })).toHaveLength(2);
    expect(screen.getByText("0 of 4 solved · 4 to catch up on")).toBeTruthy();
  });

  it("locks days older than a week for an anonymous visitor who could sign in, and opens the account sheet", async () => {
    accountState = { available: true, ready: true, user: null, openAccount };
    renderScreen();
    await waitFor(() => expect(screen.getByText("Movie Night")).toBeTruthy());
    // Today is open: Play is offered (for both of today's unsolved dailies).
    expect(screen.getAllByRole("button", { name: "Play" })).toHaveLength(2);
    const oldCell = screen.getByRole("button", { name: new RegExp(`^${longDay(lastWeek, "en")}:`) });
    expect(oldCell.getAttribute("aria-label")).toContain("locked, sign in to play");
    fireEvent.click(oldCell);
    expect(screen.getByText("Old News")).toBeTruthy();
    expect(screen.getByText("Sign in to play puzzles older than 7 days")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Race a friend/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openAccount).toHaveBeenCalledWith({ placement: "archive" });
  });

  it("does not lock anything for a signed-in account, or where no account can be offered", async () => {
    accountState = { available: true, ready: true, user: { id: "me" }, openAccount };
    renderScreen();
    await waitFor(() => expect(screen.getByText("Movie Night")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${longDay(lastWeek, "en")}:`) }));
    expect(screen.getByText("Old News")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.queryByText(/Sign in to play/)).toBeNull();
    cleanup();

    accountState = { available: false, ready: true, user: null, openAccount };
    renderScreen();
    await waitFor(() => expect(screen.getByText("Movie Night")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${longDay(lastWeek, "en")}:`) }));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.queryByText(/Sign in to play/)).toBeNull();
  });

  it("says so when the index cannot be read", async () => {
    indexDown = true;
    renderScreen();
    await waitFor(() => expect(screen.getByText("The archive couldn't be loaded right now.")).toBeTruthy());
  });
});
