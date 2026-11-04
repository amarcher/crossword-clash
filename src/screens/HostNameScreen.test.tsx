// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { HostNameScreen } from "./HostNameScreen";
import type { Puzzle } from "../types/puzzle";

/**
 * The host name screen's username prefill. The profile loads a beat after
 * the screen, so the prefill must never land on top of a name the player
 * has already started typing (Andrew typed "Arch", the room was created as
 * "Archer").
 */
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});

// The real screen reads and writes game.displayName, so the mocked context
// keeps it in React state (only this screen calls useGame here).
const gameStatic = {
  urlPuzzle: null as Puzzle | null,
  gameId: null as string | null,
  reset: vi.fn(),
  setGameId: vi.fn(),
  setIsMultiplayer: vi.fn(),
  setUrlPuzzle: vi.fn(),
  loadPuzzle: vi.fn(),
  setCompletionModalDismissed: vi.fn(),
};
vi.mock("../contexts/GameContext", () => ({
  STORAGE_KEY: "crossword-clash-solo",
  useGame: () => {
    const [displayName, setDisplayName] = useState("");
    return { ...gameStatic, displayName, setDisplayName };
  },
}));
const mpState = { shareCode: null as string | null, isHost: false, broadcastNewGame: vi.fn() };
vi.mock("../contexts/MultiplayerContext", () => ({ useMultiplayerContext: () => mpState }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
let profile: { username: string } | null = null;
vi.mock("../contexts/AccountContext", () => ({
  useAccountContext: () => ({ profile }),
  useMaybeAccount: () => null,
}));
const services = vi.hoisted(() => ({
  uploadPuzzle: vi.fn(async () => "puzzle-1"),
  createGame: vi.fn(async () => ({ gameId: "fresh", shortCode: "NEW123" })),
  createNextGame: vi.fn(async () => ({ gameId: "next", shortCode: "ABCDEF" })),
}));
vi.mock("../lib/puzzleService", () => services);
vi.mock("../lib/sessionPersistence", () => ({ clearMpSession: vi.fn() }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

const puzzle: Puzzle = { title: "T", author: "A", width: 1, height: 1, cells: [[{ row: 0, col: 0, solution: "A" }]], clues: [] };
const nameField = () => screen.getByLabelText("Your name") as HTMLInputElement;

beforeEach(() => {
  profile = null;
  gameStatic.urlPuzzle = null;
  gameStatic.gameId = null;
  mpState.shareCode = null;
  mpState.isHost = false;
  services.uploadPuzzle.mockClear();
  services.createGame.mockClear();
  services.createNextGame.mockClear();
});
afterEach(cleanup);

describe("HostNameScreen username prefill", () => {
  it("prefills the username when the profile arrives and nothing was typed", () => {
    const { rerender } = render(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    expect(nameField().value).toBe("");
    profile = { username: "Archer" };
    rerender(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    expect(nameField().value).toBe("Archer");
  });

  it("keeps a name the player had started typing when the profile arrives later", () => {
    const { rerender } = render(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    fireEvent.change(nameField(), { target: { value: "Arch" } });
    profile = { username: "Archer" };
    rerender(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    expect(nameField().value).toBe("Arch");
  });
});

/**
 * "Next puzzle, same room" is for the host of a live room. A share code on
 * its own may be a leftover: ayang329 was booted from Andrew's closed room,
 * started a room for the same daily, and the screen took his code over and
 * made her the host of a new game under it (2026-11-03).
 */
describe("HostNameScreen and a leftover share code", () => {
  async function submitWith(name: string) {
    render(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    fireEvent.change(nameField(), { target: { value: name } });
    fireEvent.submit(nameField().closest("form")!);
    await waitFor(() => expect(services.uploadPuzzle).toHaveBeenCalled());
  }

  it("starts a fresh room when the code is from a room this player no longer has", async () => {
    gameStatic.urlPuzzle = puzzle;
    mpState.shareCode = "ABCDEF";
    await submitWith("Alicia");
    await waitFor(() => expect(services.createGame).toHaveBeenCalledWith("puzzle-1", "me", { multiplayer: true, displayName: "Alicia" }));
    expect(services.createNextGame).not.toHaveBeenCalled();
  });

  it("keeps the room for the host of a live one", async () => {
    gameStatic.urlPuzzle = puzzle;
    gameStatic.gameId = "g1";
    mpState.shareCode = "ABCDEF";
    mpState.isHost = true;
    await submitWith("Archer");
    await waitFor(() => expect(services.createNextGame).toHaveBeenCalledWith("puzzle-1", "me", "ABCDEF", { displayName: "Archer" }));
    expect(services.createGame).not.toHaveBeenCalled();
  });
});
