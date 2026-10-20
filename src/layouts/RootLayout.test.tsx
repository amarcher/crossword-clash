// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import type { Puzzle } from "../types/puzzle";

// --- Mocks (RootLayout pulls in every provider; only useRejoinEffect is under test) ---

vi.mock("../contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: vi.fn(),
}));
vi.mock("../contexts/AccountContext", () => ({
  AccountProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../contexts/GameContext", () => ({
  GameProvider: ({ children }: { children: React.ReactNode }) => children,
  useGame: vi.fn(),
}));
vi.mock("../contexts/MultiplayerContext", () => ({
  MultiplayerProvider: ({ children }: { children: React.ReactNode }) => children,
  useMultiplayerContext: vi.fn(),
}));
vi.mock("../components/ToastViewport", () => ({ ToastViewport: () => null }));
vi.mock("../hooks/usePageViews", () => ({ usePageViews: () => {} }));
vi.mock("../lib/puzzleService", () => ({ rejoinGame: vi.fn() }));
vi.mock("../lib/sessionPersistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/sessionPersistence")>();
  return {
    ...actual,
    loadMpSession: vi.fn(() => null),
    clearMpSession: vi.fn(),
    saveMpSession: vi.fn(),
  };
});

import { useRejoinEffect } from "./RootLayout";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { rejoinGame } from "../lib/puzzleService";
import { loadMpSession, clearMpSession } from "../lib/sessionPersistence";

const mockUseAuth = vi.mocked(useAuth);
const mockUseGame = vi.mocked(useGame);
const mockRejoinGame = vi.mocked(rejoinGame);
const mockLoadMpSession = vi.mocked(loadMpSession);
const mockClearMpSession = vi.mocked(clearMpSession);

const HOUR = 60 * 60 * 1000;

const puzzle: Puzzle = { title: "T", author: "A", width: 1, height: 1, cells: [[{ row: 0, col: 0, solution: "A" }]], clues: [] };

function roomResult(status: "waiting" | "active") {
  return { gameId: "g1", puzzle, players: [], cells: {}, status, shareCode: "ABCDEF" };
}

function RejoinProbe() {
  useRejoinEffect();
  return <div data-testid="rejoining">rejoining</div>;
}

function renderRejoin() {
  return render(
    <MemoryRouter initialEntries={["/rejoin"]}>
      <Routes>
        <Route path="/rejoin" element={<RejoinProbe />} />
        <Route path="/" element={<div data-testid="navigated-to">/</div>} />
        <Route path="/lobby/:gameId" element={<div data-testid="navigated-to">/lobby</div>} />
        <Route path="/play/:gameId" element={<div data-testid="navigated-to">/play</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useRejoinEffect", () => {
  const game = {
    loadPuzzle: vi.fn(),
    dispatch: vi.fn(),
    setGameId: vi.fn(),
    setIsMultiplayer: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: "u1" } } as unknown as ReturnType<typeof useAuth>);
    mockUseGame.mockReturnValue(game as unknown as ReturnType<typeof useGame>);
  });

  afterEach(cleanup);

  it("walks back into a waiting room the player was in within the hour", async () => {
    mockLoadMpSession.mockReturnValue({ gameId: "g1", shareCode: "ABCDEF", displayName: "Alice", savedAt: Date.now() - 10 * 60 * 1000 });
    mockRejoinGame.mockResolvedValue(roomResult("waiting"));
    renderRejoin();
    await waitFor(() => expect(screen.getByTestId("navigated-to").textContent).toBe("/lobby"));
    expect(game.loadPuzzle).toHaveBeenCalledWith(puzzle);
    expect(game.setIsMultiplayer).toHaveBeenCalledWith(true);
    expect(mockClearMpSession).not.toHaveBeenCalled();
  });

  it("drops an hour-old waiting lobby instead of rejoining it", async () => {
    mockLoadMpSession.mockReturnValue({ gameId: "g1", shareCode: "ABCDEF", displayName: "Alice", savedAt: Date.now() - 2 * HOUR });
    mockRejoinGame.mockResolvedValue(roomResult("waiting"));
    renderRejoin();
    await waitFor(() => expect(screen.getByTestId("navigated-to").textContent).toBe("/"));
    expect(mockClearMpSession).toHaveBeenCalled();
    expect(game.setGameId).toHaveBeenCalledWith(null);
    expect(game.setIsMultiplayer).toHaveBeenCalledWith(false);
    expect(game.loadPuzzle).not.toHaveBeenCalled();
  });

  it("still rejoins an active game from an older session", async () => {
    mockLoadMpSession.mockReturnValue({ gameId: "g1", shareCode: "ABCDEF", displayName: "Alice", savedAt: Date.now() - 2 * HOUR });
    mockRejoinGame.mockResolvedValue(roomResult("active"));
    renderRejoin();
    await waitFor(() => expect(screen.getByTestId("navigated-to").textContent).toBe("/play"));
    expect(mockClearMpSession).not.toHaveBeenCalled();
  });

  it("clears the session and resolves from / when the room is gone", async () => {
    mockLoadMpSession.mockReturnValue({ gameId: "g1", shareCode: "ABCDEF", displayName: "Alice", savedAt: Date.now() });
    mockRejoinGame.mockResolvedValue(null);
    renderRejoin();
    await waitFor(() => expect(screen.getByTestId("navigated-to").textContent).toBe("/"));
    expect(mockClearMpSession).toHaveBeenCalled();
  });

  it("resolves from / when there is no session at all", async () => {
    mockLoadMpSession.mockReturnValue(null);
    renderRejoin();
    await waitFor(() => expect(screen.getByTestId("navigated-to").textContent).toBe("/"));
    expect(mockRejoinGame).not.toHaveBeenCalled();
  });
});
