// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import type { Puzzle } from "./types/puzzle";

// --- Mocks ---

// Mock layouts to prevent heavy dependency chains
vi.mock("./layouts/RootLayout", () => ({
  RootLayout: () => null,
}));

vi.mock("./layouts/HostLayout", () => ({
  HostLayout: () => null,
  useHostContext: vi.fn(),
}));

vi.mock("./contexts/GameContext", () => ({
  useGame: vi.fn(),
}));

vi.mock("./lib/sessionPersistence", () => ({
  loadMpSession: vi.fn(() => null),
  loadHostSession: vi.fn(() => null),
}));

vi.mock("./lib/puzzleUrl", () => ({
  hasImportHash: vi.fn(() => false),
}));

// Mock screen components (fallbacks rendered by redirect components)
vi.mock("./screens/MenuScreen", () => ({
  MenuScreen: () => <div data-testid="menu-screen">Menu</div>,
}));
vi.mock("./screens/host/HostMenuScreen", () => ({
  HostMenuScreen: () => <div data-testid="host-menu-screen">Host Menu</div>,
}));

// Mock remaining screen components imported by router.tsx (not under test)
vi.mock("./screens/SoloImportScreen", () => ({ SoloImportScreen: () => null }));
vi.mock("./screens/SoloPlayScreen", () => ({ SoloPlayScreen: () => null }));
vi.mock("./screens/JoinScreen", () => ({ JoinScreen: () => null }));
vi.mock("./screens/HostNameScreen", () => ({ HostNameScreen: () => null }));
vi.mock("./screens/HostImportScreen", () => ({ HostImportScreen: () => null }));
vi.mock("./screens/LobbyScreen", () => ({ LobbyScreen: () => null }));
vi.mock("./screens/MultiplayerPlayScreen", () => ({ MultiplayerPlayScreen: () => null }));
vi.mock("./screens/PuzzleReadyScreen", () => ({ PuzzleReadyScreen: () => null }));
vi.mock("./screens/ImportingScreen", () => ({ ImportingScreen: () => null }));
vi.mock("./screens/RejoinScreen", () => ({ RejoinScreen: () => null }));
vi.mock("./screens/host/HostImportScreen", () => ({ HostImportScreen: () => null }));
vi.mock("./screens/host/HostLobbyScreen", () => ({ HostLobbyScreen: () => null }));
vi.mock("./screens/host/HostSpectateScreen", () => ({ HostSpectateScreen: () => null }));
vi.mock("./screens/host/HostPuzzleReadyScreen", () => ({ HostPuzzleReadyScreen: () => null }));
vi.mock("./screens/host/HostImportingScreen", () => ({ HostImportingScreen: () => null }));
vi.mock("./screens/host/HostRejoinScreen", () => ({ HostRejoinScreen: () => null }));

// --- Imports (after mocks) ---

import { IndexRedirect, HostIndexRedirect } from "./router";
import { useGame } from "./contexts/GameContext";
import { useHostContext } from "./layouts/HostLayout";
import { loadMpSession, loadHostSession } from "./lib/sessionPersistence";
import { hasImportHash } from "./lib/puzzleUrl";

// --- Helpers ---

const mockUseGame = useGame as ReturnType<typeof vi.fn>;
const mockUseHostContext = useHostContext as ReturnType<typeof vi.fn>;
const mockLoadMpSession = loadMpSession as ReturnType<typeof vi.fn>;
const mockLoadHostSession = loadHostSession as ReturnType<typeof vi.fn>;
const mockHasImportHash = hasImportHash as ReturnType<typeof vi.fn>;

function makeMockPuzzle(): Puzzle {
  return {
    title: "Test Puzzle",
    author: "Test Author",
    width: 3,
    height: 3,
    cells: [[{ row: 0, col: 0, solution: "A" }]],
    clues: [],
  };
}

/**
 * Render a redirect component inside a MemoryRouter with target routes
 * that display their path for assertion.
 */
function renderInRouter(Component: React.FC) {
  return render(
    <MemoryRouter initialEntries={["/test-start"]}>
      <Routes>
        <Route path="/test-start" element={<Component />} />
        <Route path="/puzzle-ready" element={<div data-testid="navigated-to">/puzzle-ready</div>} />
        <Route path="/importing" element={<div data-testid="navigated-to">/importing</div>} />
        <Route path="/rejoin" element={<div data-testid="navigated-to">/rejoin</div>} />
        <Route path="/solo/play" element={<div data-testid="navigated-to">/solo/play</div>} />
        <Route path="/join" element={<div data-testid="navigated-to">/join</div>} />
        <Route path="/host/puzzle-ready" element={<div data-testid="navigated-to">/host/puzzle-ready</div>} />
        <Route path="/host/importing" element={<div data-testid="navigated-to">/host/importing</div>} />
        <Route path="/host/rejoin" element={<div data-testid="navigated-to">/host/rejoin</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const STORAGE_KEY = "crossword-clash-solo";

// --- Tests ---

describe("IndexRedirect", () => {
  beforeEach(() => {
    mockUseGame.mockReturnValue({ urlPuzzle: null });
    mockHasImportHash.mockReturnValue(false);
    mockLoadMpSession.mockReturnValue(null);
    localStorage.clear();
  });

  afterEach(cleanup);

  it("redirects to /puzzle-ready when urlPuzzle is set in context", () => {
    mockUseGame.mockReturnValue({ urlPuzzle: makeMockPuzzle() });
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/puzzle-ready");
  });

  it("redirects to /puzzle-ready even when window.location.hash is empty (bookmarklet regression)", () => {
    // This is the key regression test: the hash is consumed by GameProvider init,
    // so window.location.hash is empty. But urlPuzzle in context still has the puzzle.
    expect(window.location.hash).toBe("");
    mockUseGame.mockReturnValue({ urlPuzzle: makeMockPuzzle() });
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/puzzle-ready");
  });

  it("redirects to /importing when import hash is present", () => {
    mockUseGame.mockReturnValue({ urlPuzzle: null });
    mockHasImportHash.mockReturnValue(true);
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/importing");
  });

  it("redirects to /rejoin when multiplayer session exists", () => {
    mockUseGame.mockReturnValue({ urlPuzzle: null });
    mockLoadMpSession.mockReturnValue({ gameId: "abc", displayName: "Alice" });
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/rejoin");
  });

  it("redirects to /solo/play when saved solo session exists", () => {
    mockUseGame.mockReturnValue({ urlPuzzle: null });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ puzzle: makeMockPuzzle() }));
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/solo/play");
  });

  it("renders MenuScreen when no conditions match", () => {
    mockUseGame.mockReturnValue({ urlPuzzle: null });
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("menu-screen")).toBeTruthy();
  });

  it("urlPuzzle takes precedence over import hash", () => {
    mockUseGame.mockReturnValue({ urlPuzzle: makeMockPuzzle() });
    mockHasImportHash.mockReturnValue(true);
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/puzzle-ready");
  });

  it("import hash takes precedence over multiplayer session", () => {
    mockUseGame.mockReturnValue({ urlPuzzle: null });
    mockHasImportHash.mockReturnValue(true);
    mockLoadMpSession.mockReturnValue({ gameId: "abc", displayName: "Alice" });
    renderInRouter(IndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/importing");
  });
});

describe("HostIndexRedirect", () => {
  beforeEach(() => {
    mockUseHostContext.mockReturnValue({ urlPuzzle: null });
    mockHasImportHash.mockReturnValue(false);
    mockLoadHostSession.mockReturnValue(null);
  });

  afterEach(cleanup);

  it("redirects to /host/puzzle-ready when urlPuzzle is set in context", () => {
    mockUseHostContext.mockReturnValue({ urlPuzzle: makeMockPuzzle() });
    renderInRouter(HostIndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/host/puzzle-ready");
  });

  it("redirects to /host/puzzle-ready even when window.location.hash is empty (bookmarklet regression)", () => {
    expect(window.location.hash).toBe("");
    mockUseHostContext.mockReturnValue({ urlPuzzle: makeMockPuzzle() });
    renderInRouter(HostIndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/host/puzzle-ready");
  });

  it("redirects to /host/importing when import hash is present", () => {
    mockHasImportHash.mockReturnValue(true);
    renderInRouter(HostIndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/host/importing");
  });

  it("redirects to /host/rejoin when host session exists", () => {
    mockLoadHostSession.mockReturnValue({ gameId: "xyz" });
    renderInRouter(HostIndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/host/rejoin");
  });

  it("renders HostMenuScreen when no conditions match", () => {
    renderInRouter(HostIndexRedirect);
    expect(screen.getByTestId("host-menu-screen")).toBeTruthy();
  });

  it("urlPuzzle takes precedence over import hash", () => {
    mockUseHostContext.mockReturnValue({ urlPuzzle: makeMockPuzzle() });
    mockHasImportHash.mockReturnValue(true);
    renderInRouter(HostIndexRedirect);
    expect(screen.getByTestId("navigated-to").textContent).toBe("/host/puzzle-ready");
  });
});
