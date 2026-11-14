// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { DailyLeaderboardScreen } from "./DailyLeaderboardScreen";
import { rankEntries, shiftDay, todayKey, type PendingDailyResult, type RankedDailyEntry } from "../lib/dailyLeaderboard";
import type { DailyIndexEntry } from "../lib/dailyIndex";
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
/** The friends-only list each board fetch asked for (null = everyone), oldest first. */
const onlySeen: (string[] | null)[] = [];
const updateName = vi.fn(async () => {});
// Production by default; a test flips it to a preview.
let postsHere = true;
vi.mock("../lib/dailyLeaderboard", async () => {
  const actual = await vi.importActual<typeof import("../lib/dailyLeaderboard")>("../lib/dailyLeaderboard");
  return {
    ...actual,
    fetchDailyLeaderboard: (day: string, slot: string, _limit?: number, only?: readonly string[] | null) => {
      onlySeen.push(only ? [...only] : null);
      return fetchBoard(day, slot);
    },
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

// The daily index names a past day's puzzles; empty unless a test fills it.
let indexEntries: DailyIndexEntry[] = [];
vi.mock("../lib/dailyIndex", () => ({
  knownPublishedIndex: () => (indexEntries.length > 0 ? indexEntries : null),
  loadPublishedIndex: async () => (indexEntries.length > 0 ? indexEntries : null),
}));

// No friends unless a test adds some (the switch is on).
let friendList: { userId: string; username: string; since: string }[] = [];
vi.mock("../lib/friends", async (original) => ({ ...(await original<typeof import("../lib/friends")>()), friendsEnabled: () => true }));
vi.mock("../contexts/FriendsContext", () => ({
  useFriends: () => ({ active: friendList.length > 0, friendships: { friends: friendList, incoming: [], outgoing: [] } }),
}));

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

function renderBoard(path = "/daily/leaderboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DailyLeaderboardScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  bestTimes = {};
  indexEntries = [];
  friendList = [];
  onlySeen.length = 0;
  localStorage.clear();
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
    fireEvent.click(screen.getByRole("button", { name: /Race friends/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /Race friends/ }));
    expect(game.setUrlPuzzle).toHaveBeenCalledWith(daily.puzzle);
    expect(navigate).toHaveBeenCalledWith("/host-game/name");
  });

  it("keeps an unsigned finish on this device and posts it under the name signed through the shared form", async () => {
    const p = pending(80, "Player", false);
    p.resolve();
    game.pendingDailyResult = p;
    renderBoard();
    await screen.findByText("Ada");
    // A private finish has no public row or rank until the guest chooses to post it.
    expect(screen.getAllByRole("row").some(r => r.textContent?.includes("PlayerYou"))).toBe(false);
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
    expect(screen.getAllByRole("row").some(r => r.textContent?.includes("PlayerYou"))).toBe(false);
    expect(screen.getByTestId("board-not-posted").textContent).toBe("Preview: not posted to the board");
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(screen.getByTestId("solved-line").textContent).toBe("Solved in 1:20");
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


it("asks even a previously named guest to sign and keeps that finish out of the ranking", async () => {
  const p = pending(80, "Remembered name", false);
  p.resolve(); game.pendingDailyResult = p; renderBoard();
  await screen.findByText("Ada");
  expect(screen.getByPlaceholderText("Your name")).toHaveProperty("value", "");
  expect(screen.getAllByRole("row").some(r => r.textContent?.includes("Remembered name"))).toBe(false);
});

it("does not offer signing or add a private row when account posting is disabled", async () => {
  const p = pending(80, "Private result", false);
  p.postingHold = "disabled";
  p.resolve(); game.pendingDailyResult = p; renderBoard();
  await screen.findByText("Ada");
  expect(screen.getByText(/Solo leaderboard posting is off/)).toBeTruthy();
  expect(screen.queryByPlaceholderText("Your name")).toBeNull();
  expect(screen.getAllByRole("row").some(r => r.textContent?.includes("Private result"))).toBe(false);
});

describe("past boards (?day=)", () => {
  const today = todayKey();
  const past = shiftDay(today, -3);
  const first = shiftDay(today, -5);
  const indexed = (day: string, slot: "mini" | "midi" | "large", identity: string, title: string): DailyIndexEntry =>
    ({ day, slot, title, theme: "", author: "", width: 5, height: 5, clues: 10, identity, blocks: "" });
  const board = () =>
    rankEntries([
      { userId: "a", displayName: "Ada", mode: "solo", seconds: 60 },
      { userId: "b", displayName: "Bo", mode: "solo", seconds: 90 },
    ]);
  const rowTexts = () => screen.getAllByRole("row").slice(1).map((r) => r.textContent);

  beforeEach(() => {
    indexEntries = [indexed(first, "mini", "id-first", "Opening Day"), indexed(past, "mini", "id-past", "Old One"), indexed(past, "large", "id-past-large", "Big Old One")];
    fetchBoard.mockResolvedValue(board());
  });

  it("shows that day's board read-only, with the viewer's time slotted in where it would have placed", async () => {
    bestTimes = { "id-past": 75 };
    renderBoard(`/daily/leaderboard?day=${past}`);
    await waitFor(() => expect(screen.getByText("Ada")).toBeTruthy());
    expect(fetchBoard).toHaveBeenCalledWith(past, "mini");
    expect(fetchBoard).not.toHaveBeenCalledWith(today, "mini");

    // Ada 1st, the viewer between them as #2 and marked, Bo keeps his own rank.
    const rows = rowTexts();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("1Ada");
    expect(rows[1]).toBe("2YouNot on the board1:15");
    expect(rows[2]).toContain("2Bo");
    expect(document.querySelector("tr[data-unposted]")).toBeTruthy();
    expect(screen.getByTestId("solved-line").textContent).toBe("Your 1:15 would have placed #2 of 3");

    // The day is named, the board is final, and nothing can be posted or played for rank.
    expect(screen.getByText("Old One")).toBeTruthy();
    expect(screen.getByText(/A past day's board is final/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play Today's Mini" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Race friends" })).toBeNull();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(updateName).not.toHaveBeenCalled();
  });

  it("a board the viewer was on that day shows their own row and rank, nothing invented", async () => {
    fetchBoard.mockResolvedValue(rankEntries([{ userId: "me", displayName: "Player", mode: "solo", seconds: 50 }, ...board()]));
    renderBoard(`/daily/leaderboard?day=${past}`);
    await waitFor(() => expect(screen.getByText("Ada")).toBeTruthy());
    expect(document.querySelector("tr[data-unposted]")).toBeNull();
    expect(screen.getByTestId("solved-line").textContent).toBe("Solved in 0:50 · #1 that day");
    // A default-named row from that day is not asked to be renamed now.
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
  });

  it("an unsolved past puzzle opens the archive on that day; an empty board says nobody posted", async () => {
    fetchBoard.mockResolvedValue([]);
    renderBoard(`/daily/leaderboard?day=${past}`);
    await waitFor(() => expect(screen.getByText("Nobody posted a time that day.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Play this puzzle" }));
    expect(navigate).toHaveBeenCalledWith(`/archive?day=${past}`);
  });

  it("the stepper walks between the first daily and today", async () => {
    renderBoard();
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledWith(today, "mini"));
    const day = within(screen.getByTestId("board-day"));
    expect(day.getByText("Today")).toBeTruthy();
    expect(day.getByRole("button", { name: "Next day" })).toHaveProperty("disabled", true);

    fireEvent.click(day.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledWith(shiftDay(today, -1), "mini"));
    expect(day.queryByText("Today")).toBeNull();
    fireEvent.click(day.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(day.getByText("Today")).toBeTruthy());

    // Straight to the first day: no further back.
    cleanup();
    renderBoard(`/daily/leaderboard?day=${first}`);
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledWith(first, "mini"));
    expect(within(screen.getByTestId("board-day")).getByRole("button", { name: "Previous day" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Back to today" }));
    await waitFor(() => expect(within(screen.getByTestId("board-day")).getByText("Today")).toBeTruthy());
  });

  it("a day before the first daily, a day to come or a malformed one is today's board", async () => {
    for (const bad of [shiftDay(first, -1), shiftDay(today, 1), "soon"]) {
      fetchBoard.mockClear();
      renderBoard(`/daily/leaderboard?day=${bad}`);
      await waitFor(() => expect(fetchBoard).toHaveBeenCalledWith(today, "mini"));
      expect(screen.getByRole("button", { name: "Play Today's Mini" })).toBeTruthy();
      cleanup();
    }
  });

  it("wide: a past day shows the boards of the slots published that day", async () => {
    wideViewport();
    renderBoard(`/daily/leaderboard?day=${past}`);
    await waitFor(() => expect(fetchBoard).toHaveBeenCalledWith(past, "large"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Leaderboards");
    expect(screen.getByTestId("board-mini")).toBeTruthy();
    expect(screen.getByTestId("board-large")).toBeTruthy();
    expect(screen.queryByTestId("board-midi")).toBeNull();
    expect(screen.getByText("Big Old One")).toBeTruthy();
  });
});

describe("friends only", () => {
  const group = () => screen.getByRole("group", { name: "Whose times" });

  it("is not offered without a friend", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Ada")).toBeTruthy());
    expect(screen.queryByRole("group", { name: "Whose times" })).toBeNull();
    expect(onlySeen).toEqual([null]);
  });

  it("asks the board for the viewer and their friends, remembers the choice, and switches back", async () => {
    friendList = [{ userId: "f1", username: "alicia", since: "" }, { userId: "f2", username: "russ", since: "" }];
    renderBoard();
    await waitFor(() => expect(screen.getByText("Ada")).toBeTruthy());
    expect(within(group()).getByRole("button", { name: "Everyone" }).getAttribute("aria-pressed")).toBe("true");
    expect(onlySeen).toEqual([null]);

    fetchBoard.mockResolvedValue(rankEntries([{ userId: "f1", displayName: "Alicia", mode: "solo", seconds: 80 }]));
    fireEvent.click(within(group()).getByRole("button", { name: "Friends" }));
    await waitFor(() => expect(screen.getByText("Alicia")).toBeTruthy());
    expect(screen.queryByText("Ada")).toBeNull();
    expect(onlySeen[onlySeen.length - 1]).toEqual(["me", "f1", "f2"]);
    expect(localStorage.getItem("crossword-clash:board-friends-only")).toBe("1");

    // The next visit opens on friends.
    cleanup();
    onlySeen.length = 0;
    renderBoard();
    await waitFor(() => expect(screen.getByText("Alicia")).toBeTruthy());
    expect(onlySeen).toEqual([["me", "f1", "f2"]]);

    fetchBoard.mockResolvedValue(rankEntries([{ userId: "a", displayName: "Ada", mode: "solo", seconds: 60 }]));
    fireEvent.click(within(group()).getByRole("button", { name: "Everyone" }));
    await waitFor(() => expect(screen.getByText("Ada")).toBeTruthy());
    expect(onlySeen[onlySeen.length - 1]).toBeNull();
    expect(localStorage.getItem("crossword-clash:board-friends-only")).toBeNull();
  });

  it("says so when no friend is on the board, and a remembered choice does nothing once there are no friends", async () => {
    friendList = [{ userId: "f1", username: "alicia", since: "" }];
    localStorage.setItem("crossword-clash:board-friends-only", "1");
    fetchBoard.mockResolvedValue([]);
    renderBoard();
    await waitFor(() => expect(screen.getByText("None of your friends are on this board yet.")).toBeTruthy());

    cleanup();
    friendList = [];
    onlySeen.length = 0;
    fetchBoard.mockResolvedValue(rankEntries([{ userId: "a", displayName: "Ada", mode: "solo", seconds: 60 }]));
    renderBoard();
    await waitFor(() => expect(screen.getByText("Ada")).toBeTruthy());
    expect(onlySeen).toEqual([null]);
  });
});
