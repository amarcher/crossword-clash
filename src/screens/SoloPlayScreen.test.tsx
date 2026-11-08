// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { GameProvider, useGame } from "../contexts/GameContext";
import { MultiplayerProvider, useMultiplayerContext } from "../contexts/MultiplayerContext";
import { SoloPlayScreen } from "./SoloPlayScreen";
import { SOLO_SETTINGS_KEY, resetSoloSettingsForTests } from "../lib/soloSettings";
import { loadSoloStats } from "../lib/soloStats";
import type { User } from "@supabase/supabase-js";
import type { Puzzle } from "../types/puzzle";

/**
 * The solo screen over the real GameProvider + MultiplayerProvider (the
 * reducer, the solo input wrapper, the timer and the local stats are all
 * real); only the account, the auth user, Supabase and the daily lookups are
 * stubbed. Keystrokes go through the window handler the grid listens to.
 */
vi.mock("../lib/supabaseClient", () => ({ supabase: null }));
const posting = vi.hoisted(() => ({ user: null as User | null, daily: false, preference: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: posting.user, loading: false }) }));
vi.mock("../lib/leaderboardPreference", () => ({ fetchSoloLeaderboardPreference: posting.preference }));
vi.mock("../lib/dailyLeaderboard", async original => ({ ...await original<typeof import("../lib/dailyLeaderboard")>(), boardPostsHere: () => true }));
vi.mock("../contexts/AccountContext", () => ({
  useAccountContext: () => ({ user: null, available: false, ready: true, openAccount: vi.fn() }),
  useMaybeAccount: () => null,
}));
vi.mock("../hooks/useDailyMini", () => ({ useTodaysDailySlot: () => posting.daily ? "mini" : null }));
vi.mock("../hooks/useNextUp", () => ({ useNextUp: () => [] }));
vi.mock("../hooks/useSolveHistory", () => ({
  useSolveHistory: () => ({ status: "ready", rows: null, summary: null }),
  useStreaks: () => ({ daily: 0, nyt: 0 }),
  useBestTimes: () => ({}),
}));
const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

// CAT / BET across, CAB / TOT down, black centre.
const puzzle: Puzzle = {
  title: "Tiny",
  author: "",
  width: 3,
  height: 3,
  cells: [
    [
      { row: 0, col: 0, solution: "C", number: 1 },
      { row: 0, col: 1, solution: "A" },
      { row: 0, col: 2, solution: "T", number: 2 },
    ],
    [
      { row: 1, col: 0, solution: "A" },
      { row: 1, col: 1, solution: null },
      { row: 1, col: 2, solution: "O" },
    ],
    [
      { row: 2, col: 0, solution: "B", number: 3 },
      { row: 2, col: 1, solution: "E" },
      { row: 2, col: 2, solution: "T" },
    ],
  ],
  clues: [
    { direction: "across", number: 1, text: "Feline", row: 0, col: 0, length: 3, answer: "CAT" },
    { direction: "across", number: 3, text: "Wager", row: 2, col: 0, length: 3, answer: "BET" },
    { direction: "down", number: 1, text: "Taxi", row: 0, col: 0, length: 3, answer: "CAB" },
    { direction: "down", number: 2, text: "Digit", row: 0, col: 2, length: 3, answer: "TOT" },
  ],
};

let game: ReturnType<typeof useGame>;
let mp: ReturnType<typeof useMultiplayerContext>;
function Probe() {
  game = useGame();
  mp = useMultiplayerContext();
  return null;
}

async function renderSolo() {
  const utils = render(
    <MemoryRouter>
      <GameProvider>
        <MultiplayerProvider>
          <Probe />
          <SoloPlayScreen />
        </MultiplayerProvider>
      </GameProvider>
    </MemoryRouter>,
  );
  await act(async () => {
    await game.handleSoloPuzzleLoaded(puzzle);
  });
  return utils;
}

const type = (letters: string) => {
  for (const key of letters) {
    act(() => {
      fireEvent.keyDown(window, { key });
    });
  }
};
const cell = (row: number, col: number) =>
  screen.getAllByRole("gridcell").find((el) => el.getAttribute("aria-label")?.startsWith(`Row ${row + 1}, Column ${col + 1}`))!;
const openOptions = () => fireEvent.click(screen.getByRole("button", { name: "Puzzle options" }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetSoloSettingsForTests();
  track.mockClear();
  posting.user = null;
  posting.daily = false;
  posting.preference.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  resetSoloSettingsForTests();
});

describe("SoloPlayScreen autocheck", () => {
  it("judges every letter against the cursor as it actually stands, even two typed before a render", async () => {
    // Andrew, 2026-11-01: typing T then Y into STY on the iPhone shook the grid
    // at the Y. Two keystrokes inside one act() reach the input wrapper before
    // React has re-rendered, so a judgment made from the last render's cursor
    // would compare the second letter with the first letter's square.
    await renderSolo();
    act(() => {
      fireEvent.keyDown(window, { key: "c" });
      fireEvent.keyDown(window, { key: "a" });
      fireEvent.keyDown(window, { key: "t" });
    });
    expect(cell(0, 0).getAttribute("aria-label")).toBe("Row 1, Column 1, 1, C");
    expect(cell(0, 1).getAttribute("aria-label")).toBe("Row 1, Column 2, A");
    expect(cell(0, 2).getAttribute("aria-label")).toBe("Row 1, Column 3, 2, T");
    expect(mp.wrongLetters).toBe(0);
    expect(mp.wrongCells).toEqual([]);

    // A genuinely wrong letter still flashes the square it was typed into:
    // CAT complete, the cursor has moved on to 3 Across.
    act(() => {
      fireEvent.keyDown(window, { key: "x" });
    });
    expect(mp.wrongLetters).toBe(1);
    expect(mp.wrongCells).toEqual(["2,0"]);
  });

  it("with autocheck on (the default) a wrong letter is refused and the switch says so", async () => {
    await renderSolo();
    type("x");
    expect(cell(0, 0).getAttribute("aria-label")).toBe("Row 1, Column 1, 1");
    expect(game.playerCells["0,0"]).toBeUndefined();
    type("c");
    expect(cell(0, 0).getAttribute("aria-label")).toBe("Row 1, Column 1, 1, C");

    openOptions();
    const toggle = screen.getByRole("switch", { name: /Autocheck/ });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(within(toggle).getByText("Off: type freely, check when the grid is full")).toBeTruthy();
  });

  it("turned off: letters land as typed, a full-but-wrong grid shows the notice, Check puzzle marks the square, fixing it completes the puzzle", async () => {
    await renderSolo();
    openOptions();
    fireEvent.click(screen.getByRole("switch", { name: /Autocheck/ }));
    expect(screen.getByRole("switch", { name: /Autocheck/ }).getAttribute("aria-checked")).toBe("false");
    expect(JSON.parse(localStorage.getItem(SOLO_SETTINGS_KEY)!)).toEqual({ autocheck: false });
    expect(track).toHaveBeenCalledWith("autocheck_toggled", { on: false });
    fireEvent.keyDown(screen.getByRole("switch", { name: /Autocheck/ }), { key: "Escape" });
    expect(screen.queryByRole("switch")).toBeNull();

    // CAT, BET, the A of CAB, then X where TOT wants its O.
    type("catbetax");
    expect(cell(1, 2).getAttribute("aria-label")).toBe("Row 2, Column 3, X");
    const notice = await screen.findByTestId("wrong-notice");
    expect(notice.textContent).toContain("Filled, but 1 square isn't right");
    expect(screen.queryByRole("dialog", { name: "Puzzle complete" })).toBeNull();
    // The scoreboard counts typed squares, not correct ones (no leak).
    expect(screen.getAllByRole("progressbar")[0].getAttribute("aria-valuenow")).toBe("100");

    fireEvent.click(within(notice).getByRole("button", { name: "Check puzzle" }));
    expect(cell(1, 2).getAttribute("aria-label")).toBe("Row 2, Column 3, X, incorrect");
    expect(cell(0, 0).getAttribute("aria-label")).toBe("Row 1, Column 1, 1, C");
    expect(track).toHaveBeenCalledWith("puzzle_checked", { scope: "puzzle" });

    // Check moved the cursor onto the marked square: retype it.
    expect(game.selectedCell).toEqual({ row: 1, col: 2 });
    type("o");
    expect(cell(1, 2).getAttribute("aria-label")).toBe("Row 2, Column 3, O");
    await screen.findByRole("dialog", { name: "Puzzle complete" });
    expect(screen.queryByTestId("wrong-notice")).toBeNull();
    expect(screen.queryByText("Solved with reveals")).toBeNull();
    // A clean finish still rolls the streak (a 0 s finish sets no best time), flagged as free-typed.
    expect(loadSoloStats().streak.current).toBe(1);
    expect(track).toHaveBeenCalledWith("puzzle_completed", expect.objectContaining({ mode: "solo", autocheck: false, assisted: false }));
  });

  it("Check word marks only the active entry, Reveal square fills the cursor square and makes the finish assisted", async () => {
    localStorage.setItem(SOLO_SETTINGS_KEY, JSON.stringify({ autocheck: false }));
    await renderSolo();
    // Two wrong squares: the E of BET and the O of TOT.
    type("catbxtax");
    const notice = await screen.findByTestId("wrong-notice");
    expect(notice.textContent).toContain("Filled, but 2 squares aren't right");

    // The cursor rests on (1,2), in 2-Down: Check word marks that entry's wrong square only.
    fireEvent.click(within(notice).getByRole("button", { name: "Check word" }));
    expect(cell(1, 2).getAttribute("aria-label")).toContain("incorrect");
    expect(cell(2, 1).getAttribute("aria-label")).toBe("Row 3, Column 2, X");

    fireEvent.click(within(notice).getByRole("button", { name: "Reveal square" }));
    expect(cell(1, 2).getAttribute("aria-label")).toBe("Row 2, Column 3, O, revealed");
    // Fix the other one by hand.
    act(() => game.selectCell(2, 1));
    type("e");
    const modal = await screen.findByRole("dialog", { name: "Puzzle complete" });
    expect(within(modal).getByText("Solved with reveals")).toBeTruthy();
    // Solved, but nothing on record: no best time, no streak day.
    expect(loadSoloStats().bestTimes).toEqual({});
    expect(loadSoloStats().streak.current).toBe(0);
    expect(track).toHaveBeenCalledWith("puzzle_completed", expect.objectContaining({ assisted: true }));
  });

  it("on a phone the same switch sits in the clue sheet, where the header has no room for the gear", async () => {
    await renderSolo();
    // The clue bar's clue button opens the sheet.
    fireEvent.click(screen.getByRole("button", { name: /1\. Feline/ }));
    const sheet = screen.getByRole("dialog", { name: "Clue list" });
    const toggle = within(sheet).getByRole("switch", { name: /Autocheck/ });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(JSON.parse(localStorage.getItem(SOLO_SETTINGS_KEY)!)).toEqual({ autocheck: false });
  });

  it("the notice can be dismissed and comes back once the grid changes", async () => {
    localStorage.setItem(SOLO_SETTINGS_KEY, JSON.stringify({ autocheck: false }));
    await renderSolo();
    type("catbetax");
    const notice = await screen.findByTestId("wrong-notice");
    fireEvent.click(within(notice).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("wrong-notice")).toBeNull();
    // Erase and retype the wrong square: full again, so the notice returns.
    act(() => game.selectCell(1, 2));
    act(() => {
      fireEvent.keyDown(window, { key: "Backspace" });
    });
    expect(screen.queryByTestId("wrong-notice")).toBeNull();
    type("x");
    await waitFor(() => expect(screen.getByTestId("wrong-notice")).toBeTruthy());
  });

  it("turning autocheck back on judges the letters already typed", async () => {
    localStorage.setItem(SOLO_SETTINGS_KEY, JSON.stringify({ autocheck: false }));
    await renderSolo();
    type("cx");
    openOptions();
    fireEvent.click(screen.getByRole("switch", { name: /Autocheck/ }));
    expect(cell(0, 1).getAttribute("aria-label")).toBe("Row 1, Column 2, X, incorrect");
    // From here a wrong letter is refused again and the right one replaces the mark.
    act(() => game.selectCell(0, 1));
    type("z");
    expect(cell(0, 1).getAttribute("aria-label")).toBe("Row 1, Column 2, X, incorrect");
    type("a");
    expect(cell(0, 1).getAttribute("aria-label")).toBe("Row 1, Column 2, A");
  });
});

describe("pause and resume", () => {
  it("hides every clue and blocks physical input until Resume", async () => {
    await renderSolo();
    type("c");
    const cells = game.playerCells;
    const selected = game.selectedCell;
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeTruthy();
    expect(screen.queryAllByRole("gridcell")).toHaveLength(0);
    expect(screen.queryAllByRole("grid")).toHaveLength(0);
    type("at");
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(game.playerCells).toBe(cells);
    expect(game.selectedCell).toEqual(selected);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.queryByRole("dialog", { name: "Paused" })).toBeNull();
    type("a");
    expect(game.playerCells["0,1"].letter).toBe("A");
  });

  it("preserves the attempt on Save & exit and restores paused after a reload", async () => {
    const view = await renderSolo();
    type("c");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & exit" }));
    expect(localStorage.getItem("crossword-clash:solo-landing")).toBe("menu");
    expect(JSON.parse(localStorage.getItem("crossword-clash-solo")!).playerCells["0,0"].letter).toBe("C");
    view.unmount();
    render(<MemoryRouter><GameProvider><MultiplayerProvider><Probe /><SoloPlayScreen /></MultiplayerProvider></GameProvider></MemoryRouter>);
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeTruthy();
    expect(game.playerCells["0,0"].letter).toBe("C");
  });

  it("keeps the puzzle open and offers retry if saving fails", async () => {
    await renderSolo();
    type("c");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("alert").textContent).toContain("couldn’t save");
    expect(screen.queryByRole("button", { name: "Save & exit" })).toBeNull();
    expect(game.playerCells["0,0"].letter).toBe("C");
    write.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "Save & exit" })).toBeTruthy();
  });
});

vi.mock("../components/Push", () => ({ ReminderSwitch: () => null, NotificationSettings: () => null }));


async function finishDaily(anonymous: boolean) {
  posting.user = { id: "me", is_anonymous: anonymous } as User;
  posting.daily = true;
  await renderSolo();
  act(() => game.setDisplayName("Remembered name"));
  type("catbetao");
  await screen.findByRole("dialog", { name: "Puzzle complete" });
}

it("a guest who already has a name must explicitly post each solo finish", async () => {
  await finishDaily(true);
  await screen.findByText("Add your name to post your time to today's board");
  expect(game.pendingDailyResult?.posted).toBe(false);
  expect(screen.getByPlaceholderText("Your name")).toHaveProperty("value", "");
  fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Guest entry" } });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() => expect(game.pendingDailyResult?.posted).toBe(true));
  expect(game.pendingDailyResult?.entry.displayName).toBe("Guest entry");
});

it("a signed-in solver who opted out sees a private finish without a posting form", async () => {
  posting.preference.mockResolvedValue(false);
  await finishDaily(false);
  await screen.findByText(/Solo leaderboard posting is off/);
  expect(game.pendingDailyResult).toMatchObject({ posted: false, postingHold: "disabled" });
  expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  expect(screen.getByTestId("share-block-preview")).toBeTruthy();
});

it("a signed-in solver with the default setting posts after the preference resolves", async () => {
  let resolve!:(enabled: boolean) => void;
  posting.preference.mockReturnValue(new Promise<boolean>(r => { resolve = r; }));
  await finishDaily(false);
  expect(game.pendingDailyResult).toMatchObject({ posted: false, postingHold: "checking" });
  expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  await act(async () => { resolve(true); });
  await waitFor(() => expect(game.pendingDailyResult?.posted).toBe(true));
});
