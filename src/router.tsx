import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { HostLayout } from "./layouts/HostLayout";

// Player screens
import { MenuScreen } from "./screens/MenuScreen";
import { SoloImportScreen } from "./screens/SoloImportScreen";
import { SoloPlayScreen } from "./screens/SoloPlayScreen";
import { JoinScreen } from "./screens/JoinScreen";
import { HostNameScreen } from "./screens/HostNameScreen";
import { HostImportScreen } from "./screens/HostImportScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { MultiplayerPlayScreen } from "./screens/MultiplayerPlayScreen";
import { PuzzleReadyScreen } from "./screens/PuzzleReadyScreen";
import { ImportingScreen } from "./screens/ImportingScreen";
import { RejoinScreen } from "./screens/RejoinScreen";

// Host/TV screens
import { HostMenuScreen } from "./screens/host/HostMenuScreen";
import { HostImportScreen as HostTVImportScreen } from "./screens/host/HostImportScreen";
import { HostLobbyScreen } from "./screens/host/HostLobbyScreen";
import { HostSpectateScreen } from "./screens/host/HostSpectateScreen";
import { HostPuzzleReadyScreen } from "./screens/host/HostPuzzleReadyScreen";
import { HostImportingScreen } from "./screens/host/HostImportingScreen";
import { HostRejoinScreen } from "./screens/host/HostRejoinScreen";

// Initial route resolver utilities
import { loadMpSession, loadHostSession } from "./lib/sessionPersistence";
import { hasImportHash } from "./lib/puzzleUrl";

const STORAGE_KEY = "crossword-clash-solo";

/**
 * Determine the initial redirect target for the root "/" route.
 * This replicates the old App.tsx initial state computation.
 */
function IndexRedirect() {
  // Check for URL puzzle hash
  if (window.location.hash.startsWith("#puzzle=")) {
    return <Navigate to="/puzzle-ready" replace />;
  }

  // Check for import hash
  if (hasImportHash()) {
    return <Navigate to="/importing" replace />;
  }

  // Check for ?join= query param
  const params = new URLSearchParams(window.location.search);
  if (params.get("join")) {
    return <Navigate to={`/join${window.location.search}`} replace />;
  }

  // Check for multiplayer session to rejoin
  const mpSession = loadMpSession();
  if (mpSession) {
    return <Navigate to="/rejoin" replace />;
  }

  // Check for saved solo session
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved?.puzzle) {
        return <Navigate to="/solo/play" replace />;
      }
    }
  } catch {
    // ignore
  }

  return <MenuScreen />;
}

/**
 * Determine the initial redirect target for the /host route.
 */
function HostIndexRedirect() {
  // Check for URL puzzle hash
  if (window.location.hash.startsWith("#puzzle=")) {
    return <Navigate to="/host/puzzle-ready" replace />;
  }

  // Check for import hash
  if (hasImportHash()) {
    return <Navigate to="/host/importing" replace />;
  }

  // Check for host session to rejoin
  const hostSession = loadHostSession();
  if (hostSession) {
    return <Navigate to="/host/rejoin" replace />;
  }

  return <HostMenuScreen />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: IndexRedirect },
      { path: "menu", Component: MenuScreen },
      { path: "solo/import", Component: SoloImportScreen },
      { path: "solo/play", Component: SoloPlayScreen },
      { path: "join", Component: JoinScreen },
      { path: "host-game/name", Component: HostNameScreen },
      { path: "host-game/import", Component: HostImportScreen },
      { path: "lobby/:gameId", Component: LobbyScreen },
      { path: "play/:gameId", Component: MultiplayerPlayScreen },
      { path: "puzzle-ready", Component: PuzzleReadyScreen },
      { path: "importing", Component: ImportingScreen },
      { path: "rejoin", Component: RejoinScreen },
    ],
  },
  {
    path: "/host",
    Component: HostLayout,
    children: [
      { index: true, Component: HostIndexRedirect },
      { path: "import", Component: HostTVImportScreen },
      { path: "lobby/:gameId", Component: HostLobbyScreen },
      { path: "spectate/:gameId", Component: HostSpectateScreen },
      { path: "puzzle-ready", Component: HostPuzzleReadyScreen },
      { path: "importing", Component: HostImportingScreen },
      { path: "rejoin", Component: HostRejoinScreen },
    ],
  },
]);
