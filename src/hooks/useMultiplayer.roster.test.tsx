// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { GameProvider, useGame } from "../contexts/GameContext";
import { MultiplayerProvider, useMultiplayerContext } from "../contexts/MultiplayerContext";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { LobbyScreen } from "../screens/LobbyScreen";
import type { Puzzle } from "../types/puzzle";
import type { Player } from "../types/game";

/**
 * The lobby roster over the real GameProvider + MultiplayerProvider (the room
 * hook is real); Supabase is a fake Realtime channel whose presence syncs the
 * test fires by hand, and the service module answers the DB reads. What is
 * under test: the name the player typed is the one presence carries and the
 * one every roster render shows, from the first (DB bootstrap) render on,
 * and a re-hydrate neither renames nor reorders the list.
 */
type Handler = (arg: { payload: Record<string, unknown> }) => void;
const fake = vi.hoisted(() => {
  const handlers: Record<string, Handler[]> = {};
  const state = {
    handlers,
    subscribeCb: null as null | ((status: string, err?: Error) => Promise<void> | void),
    presence: {} as Record<string, { user_id: string; display_name: string; color: string }[]>,
    track: vi.fn((..._args: unknown[]) => Promise.resolve("ok")),
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
    track: (...args: unknown[]) => state.track(...args),
    untrack: () => Promise.resolve("ok"),
    send: () => Promise.resolve("ok"),
    unsubscribe: () => Promise.resolve("ok"),
  };
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
vi.mock("../hooks/useSolveHistory", () => ({
  useSolveHistory: () => ({ status: "ready", rows: null, summary: null }),
  useStreaks: () => ({ daily: 0, nyt: 0 }),
  useBestTimes: () => ({}),
}));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("react-qr-code", () => ({ default: () => <div data-testid="qr-code" /> }));

const puzzle: Puzzle = {
  title: "Tiny",
  author: "",
  width: 2,
  height: 1,
  cells: [[{ row: 0, col: 0, solution: "H", number: 1 }, { row: 0, col: 1, solution: "I" }]],
  clues: [{ direction: "across", number: 1, text: "Greeting", row: 0, col: 0, length: 2, answer: "HI" }],
};

// The host's row comes first in the DB (created_at order); the local
// player's row still carries the name an earlier visit stored.
const host: Player = { id: "host", gameId: "g1", userId: "host", displayName: "Alicia", color: "#ef4444", score: 0 };
const myStaleRow: Player = { id: "me", gameId: "g1", userId: "me", displayName: "Archer", color: "#3b82f6", score: 0 };
const tracked = (p: Player) => ({ user_id: p.userId, display_name: p.displayName, color: p.color });

let game: ReturnType<typeof useGame>;
let mp: ReturnType<typeof useMultiplayerContext>;
/** Every distinct roster the provider handed out, as "name,name". */
let rosters: string[] = [];
function Probe() {
  game = useGame();
  mp = useMultiplayerContext();
  const names = mp.players.map((p) => p.displayName).join(",");
  if (rosters[rosters.length - 1] !== names) rosters.push(names);
  return null;
}

async function renderLobby(typed: string) {
  const utils = render(
    <MemoryRouter initialEntries={["/lobby/g1"]}>
      <ConfirmProvider>
        <GameProvider>
          <MultiplayerProvider>
            <Probe />
            <LobbyScreen />
          </MultiplayerProvider>
        </GameProvider>
      </ConfirmProvider>
    </MemoryRouter>,
  );
  await act(async () => {
    game.loadPuzzle(puzzle);
    game.setDisplayName(typed);
    game.setGameId("g1");
    game.setIsMultiplayer(true);
  });
  await waitFor(() => expect(fake.subscribeCb).not.toBeNull());
  await act(async () => {
    await fake.subscribeCb!("SUBSCRIBED");
  });
  return utils;
}

/** The presence state as the server would hold it, in the given order. */
const syncPresence = (players: { user_id: string; display_name: string; color: string }[]) =>
  act(() => {
    fake.presence = Object.fromEntries(players.map((p) => [`ref-${p.user_id}`, [p]]));
    for (const h of fake.handlers["presence:sync"] ?? []) h({ payload: {} });
  });
const tabComesBack = () =>
  act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
  });
/** The lobby's player rows as "name" or "name (Host)". */
function lobbyRows() {
  const list = screen.getByRole("heading", { name: /^Players/ }).parentElement!.querySelector("ul")!;
  return within(list)
    .getAllByRole("listitem")
    .filter((li) => !li.textContent?.includes("Waiting for players"))
    .map((li) => li.textContent?.trim());
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  for (const k of Object.keys(fake.handlers)) delete fake.handlers[k];
  fake.subscribeCb = null;
  fake.presence = {};
  fake.track.mockClear();
  services.fetchGameState.mockReset();
  rosters = [];
});
afterEach(cleanup);

describe("the lobby roster and the name the player typed", () => {
  it("tracks the typed name, shows it from the first roster render, and keeps the DB order through presence syncs and re-hydrates", async () => {
    services.fetchGameState.mockResolvedValue({
      cells: {},
      players: [host, myStaleRow],
      status: "waiting",
      settings: null,
      startedAt: null,
      completedAt: null,
    });
    await renderLobby("Arch");

    // Presence carries the typed name, not the row's old one.
    expect(fake.track).toHaveBeenCalledTimes(1);
    expect(fake.track).toHaveBeenCalledWith({ user_id: "me", display_name: "Arch", color: "#3b82f6" });
    // The DB bootstrap already shows it, host first.
    expect(lobbyRows()).toEqual(["AliciaHost", "Arch"]);

    // The server's presence state arrives in another order: the list keeps
    // the DB order (so the Host chip stays on the host) and the typed name.
    await syncPresence([{ user_id: "me", display_name: "Arch", color: "#3b82f6" }, tracked(host)]);
    expect(lobbyRows()).toEqual(["AliciaHost", "Arch"]);

    // A tab wake re-hydrates from the DB, whose row still says "Archer":
    // nothing is renamed or reordered.
    await tabComesBack();
    expect(lobbyRows()).toEqual(["AliciaHost", "Arch"]);
    expect(rosters).toEqual(["", "Alicia,Arch"]);

    // A player who left (gone from presence) does not come back on a re-hydrate.
    await syncPresence([{ user_id: "me", display_name: "Arch", color: "#3b82f6" }]);
    await tabComesBack();
    expect(lobbyRows()).toEqual(["ArchHost"]);
  });

  it("tracks presence once the player's own row lands after the first hydrate (a next puzzle in the same room)", async () => {
    services.fetchGameState.mockResolvedValueOnce({ cells: {}, players: [host], status: "waiting", settings: null, startedAt: null, completedAt: null });
    await renderLobby("Arch");
    expect(fake.track).not.toHaveBeenCalled();
    expect(lobbyRows()).toEqual(["AliciaHost"]);

    services.fetchGameState.mockResolvedValue({ cells: {}, players: [host, myStaleRow], status: "waiting", settings: null, startedAt: null, completedAt: null });
    await tabComesBack();
    expect(fake.track).toHaveBeenCalledWith({ user_id: "me", display_name: "Arch", color: "#3b82f6" });
    expect(lobbyRows()).toEqual(["AliciaHost", "Arch"]);
  });
});
