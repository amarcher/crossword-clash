// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { GameProvider, useGame } from "../contexts/GameContext";
import { MultiplayerProvider, useMultiplayerContext } from "../contexts/MultiplayerContext";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { MultiplayerPlayScreen } from "./MultiplayerPlayScreen";
import type { Puzzle } from "../types/puzzle";
import type { Player } from "../types/game";

/**
 * The multiplayer play screen over the real GameProvider + MultiplayerProvider
 * (the reducer and the room hook are real); Supabase is a fake Realtime
 * channel whose presence and broadcasts the test drives by hand, and the
 * service module answers the DB reads. What is under test: once the room is
 * finished, the standings and the share rows are a frozen record that
 * presence can no longer touch.
 */
type Handler = (arg: { payload: Record<string, unknown> }) => void;
const fake = vi.hoisted(() => {
  const handlers: Record<string, Handler[]> = {};
  const state = {
    handlers,
    subscribeCb: null as null | ((status: string, err?: Error) => Promise<void> | void),
    presence: {} as Record<string, { user_id: string; display_name: string; color: string }[]>,
    channel: {} as Record<string, unknown>,
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "single"]) chain[m] = () => chain;
  chain.then = (cb: (r: { data: { short_code: string }; error: null }) => void) => {
    cb({ data: { short_code: "ABC123" }, error: null });
    return Promise.resolve();
  };
  state.channel = {
    on(type: string, filter: { event: string }, cb: Handler) {
      (handlers[`${type}:${filter.event}`] ??= []).push(cb);
      return state.channel;
    },
    subscribe(cb: (status: string) => Promise<void>) {
      state.subscribeCb = cb;
      return state.channel;
    },
    presenceState: () => state.presence,
    track: () => Promise.resolve("ok"),
    untrack: () => Promise.resolve("ok"),
    send: () => Promise.resolve("ok"),
    unsubscribe: () => Promise.resolve("ok"),
  };
  // One object, not a spread copy: the test reassigns `subscribeCb` and `presence` on it.
  return Object.assign(state, { client: { channel: () => state.channel, from: () => chain } });
});
const services = vi.hoisted(() => ({
  fetchGameState: vi.fn(),
  claimCellOnServer: vi.fn(async () => true),
  startGame: vi.fn(async () => true),
  recordRaceFinish: vi.fn(async () => {}),
}));

vi.mock("../lib/supabaseClient", () => ({ supabase: fake.client }));
vi.mock("../lib/puzzleService", () => services);
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me", is_anonymous: true }, loading: false }) }));
vi.mock("../contexts/AccountContext", () => ({
  useAccountContext: () => ({ user: null, available: false, ready: true, openAccount: vi.fn() }),
  useMaybeAccount: () => null,
}));
vi.mock("../hooks/useDailyMini", () => ({ useTodaysDailySlot: () => null }));
vi.mock("../hooks/useNextUp", () => ({ useNextUp: () => [] }));
vi.mock("../hooks/usePlayInsights", () => ({ usePlayInsights: () => {} }));
vi.mock("../hooks/useSolveHistory", () => ({
  useSolveHistory: () => ({ status: "ready", rows: null, summary: null }),
  useStreaks: () => ({ daily: 0, nyt: 0 }),
  useBestTimes: () => ({}),
}));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

// CAT / BET across, CAB / TOT down, black centre: 8 white squares.
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

const me: Player = { id: "me", gameId: "g1", userId: "me", displayName: "Archer", color: "#3b82f6", score: 0 };
const partner: Player = { id: "partner", gameId: "g1", userId: "partner", displayName: "Alicia", color: "#ef4444", score: 0 };
const tracked = (p: Player) => ({ user_id: p.userId, display_name: p.displayName, color: p.color });
const MINE = ["0,0", "0,1", "0,2", "1,0", "2,0"];
const THEIRS = ["1,2", "2,1", "2,2"];
const letterAt = (key: string) => {
  const [r, c] = key.split(",").map(Number);
  return puzzle.cells[r][c].solution as string;
};
/** Every square claimed, as the DB holds it. */
function claimedCells() {
  const cells: Record<string, { letter: string; correct: boolean; playerId: string }> = {};
  for (const key of MINE) cells[key] = { letter: letterAt(key), correct: true, playerId: "me" };
  for (const key of THEIRS) cells[key] = { letter: letterAt(key), correct: true, playerId: "partner" };
  return cells;
}

let game: ReturnType<typeof useGame>;
let mp: ReturnType<typeof useMultiplayerContext>;
function Probe() {
  game = useGame();
  mp = useMultiplayerContext();
  return null;
}

async function renderRoom() {
  const utils = render(
    <MemoryRouter>
      <ConfirmProvider>
        <GameProvider>
          <MultiplayerProvider>
            <Probe />
            <MultiplayerPlayScreen />
          </MultiplayerProvider>
        </GameProvider>
      </ConfirmProvider>
    </MemoryRouter>,
  );
  await act(async () => {
    game.loadPuzzle(puzzle);
    // The name this player typed: their own roster row always carries it.
    game.setDisplayName(me.displayName);
    game.setGameId("g1");
    game.setIsMultiplayer(true);
  });
  await waitFor(() => expect(fake.subscribeCb).not.toBeNull());
  await act(async () => {
    await fake.subscribeCb!("SUBSCRIBED");
  });
  return utils;
}

const syncPresence = (players: Player[]) =>
  act(() => {
    fake.presence = Object.fromEntries(players.map((p) => [p.userId, [tracked(p)]]));
    for (const h of fake.handlers["presence:sync"] ?? []) h({ payload: {} });
  });
const remoteClaim = (key: string, playerId: string) =>
  act(() => {
    const [row, col] = key.split(",").map(Number);
    for (const h of fake.handlers["broadcast:cell_claimed"] ?? []) h({ payload: { row, col, letter: letterAt(key), playerId } });
  });

/** The modal's ranked rows as "name:squares", and the share preview's emoji rows. */
function record() {
  const dialog = screen.getByRole("dialog", { name: "Puzzle complete" });
  const rows = [...dialog.querySelectorAll("tbody tr")].map((tr) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim());
    return `${cells[1]}:${cells[2]}`;
  });
  const preview = within(dialog).getByTestId("share-block-preview");
  const grid = [...preview.querySelectorAll("div[aria-hidden] > div")].map((d) => d.textContent);
  return { rows, grid, legend: within(dialog).getByTestId("share-legend").textContent, outcome: within(dialog).getByText(/wins|tie/).textContent };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  for (const k of Object.keys(fake.handlers)) delete fake.handlers[k];
  fake.subscribeCb = null;
  fake.presence = {};
  services.fetchGameState.mockReset();
});
afterEach(cleanup);

describe("MultiplayerPlayScreen after the finish", () => {
  it("keeps the standings, the share rows and the legend when the partner drops from presence, the tab comes back, or everyone leaves", async () => {
    services.fetchGameState.mockResolvedValue({
      cells: {},
      players: [me, partner],
      status: "active",
      settings: { wrongAnswerTimeoutSeconds: 0, raceMode: "versus" },
      startedAt: 1_000,
      completedAt: null,
    });
    await renderRoom();
    await waitFor(() => expect(mp.gameStatus).toBe("active"));
    await syncPresence([me, partner]);
    expect(mp.players.map((p) => p.userId)).toEqual(["me", "partner"]);

    // The partner's squares arrive over the channel; mine go through the
    // claim path (INPUT_LETTER writes at the cursor, so select first).
    for (const key of THEIRS) remoteClaim(key, "partner");
    for (const key of MINE) {
      const [row, col] = key.split(",").map(Number);
      await act(async () => {
        game.selectCell(row, col);
      });
      await act(async () => {
        mp.claimCell(row, col, letterAt(key));
      });
    }
    await waitFor(() => expect(mp.gameStatus).toBe("completed"));
    expect(mp.finalStandings?.winnerIds).toEqual(["me"]);

    const frozen = record();
    expect(frozen.outcome).toBe("Archer wins with 5 squares!");
    expect(frozen.rows).toEqual(["Archer:5", "Alicia:3"]);
    expect(frozen.grid).toEqual(["🟦🟦🟦", "🟦⬛🟥", "🟦🟥🟥"]);
    expect(frozen.legend).toBe("Who solved each square: 🟦 Archer, 🟥 Alicia");

    // Alicia leaves the room: presence now holds only me.
    await syncPresence([me]);
    expect(mp.players.map((p) => p.userId)).toEqual(["me"]);
    expect(record()).toEqual(frozen);
    // The grid keeps her colour too.
    expect(mp.playerColorMap).toEqual({ me: "#3b82f6", partner: "#ef4444" });

    // The app comes back to the foreground: a re-hydrate from the DB.
    services.fetchGameState.mockResolvedValue({
      cells: claimedCells(),
      players: [me, partner],
      status: "completed",
      settings: { wrongAnswerTimeoutSeconds: 0, raceMode: "versus" },
      startedAt: 1_000,
      completedAt: 61_000,
    });
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(record()).toEqual(frozen);

    // Everyone gone (an empty sync after presence warmed) — still the same record.
    await syncPresence([]);
    expect(mp.players).toEqual([]);
    expect(record()).toEqual(frozen);
    expect(screen.getByTestId("finished-bar").textContent).toContain("1:00");
  });

  it("rebuilds the record from the DB's cells and player rows when a completed room is hydrated with nobody present", async () => {
    services.fetchGameState.mockResolvedValue({
      cells: claimedCells(),
      players: [me, partner],
      status: "completed",
      settings: { wrongAnswerTimeoutSeconds: 0, raceMode: "versus" },
      startedAt: 1_000,
      completedAt: 91_000,
    });
    await renderRoom();
    await waitFor(() => expect(mp.finalStandings).not.toBeNull());
    expect(mp.finalStandings?.players.map((p) => [p.userId, p.color, p.cellsClaimed])).toEqual([
      ["me", "#3b82f6", 5],
      ["partner", "#ef4444", 3],
    ]);
    const frozen = record();
    expect(frozen.rows).toEqual(["Archer:5", "Alicia:3"]);
    expect(frozen.grid).toEqual(["🟦🟦🟦", "🟦⬛🟥", "🟦🟥🟥"]);

    // Presence warming up with only me, then emptying, changes nothing.
    await syncPresence([me]);
    await syncPresence([]);
    expect(record()).toEqual(frozen);
  });
});
