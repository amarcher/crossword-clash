import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { HostLayout } from "./layouts/HostLayout";

// MenuScreen + HostMenuScreen are imported statically because the index-route
// resolvers below render them inline as the fallback. Every other screen is
// code-split via route-level `lazy` (see the route config) so visiting the menu
// doesn't download the entire app (game grid, importer, narrator, etc.).
import { MenuScreen } from "./screens/MenuScreen";
import { HostMenuScreen } from "./screens/host/HostMenuScreen";

// Initial route resolver utilities
import { loadMpSession, loadHostSession } from "./lib/sessionPersistence";
import { hasImportHash } from "./lib/puzzleUrl";
import { useGame } from "./contexts/GameContext";
import { useHostContext } from "./layouts/HostLayout";

const STORAGE_KEY = "crossword-clash-solo";

/**
 * Determine the initial redirect target for the root "/" route.
 * This replicates the old App.tsx initial state computation.
 */
function IndexRedirect() {
  const game = useGame();

  // Check for URL puzzle (hash already consumed by GameProvider init)
  if (game.urlPuzzle) {
    // A challenge deep link carries the challenger's name + ghost time alongside
    // the puzzle — land on the accept screen instead of the plain mode picker.
    if (game.urlChallenge) {
      return <Navigate to="/challenge" replace />;
    }
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
  const host = useHostContext();

  // Check for URL puzzle (hash already consumed by HostLayout init)
  if (host.urlPuzzle) {
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

// Exported for testing
export { IndexRedirect, HostIndexRedirect };

// Note: /install-bookmarklet is served by the static file at
// public/install-bookmarklet/index.html (generated from
// bookmarklet/install-page.html by scripts/build-bookmarklet.mjs).
// It is intentionally NOT a React route — see PR #36 for the Safe
// Browsing rationale. Edit the HTML template, not React.
export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: IndexRedirect },
      { path: "menu", Component: MenuScreen },
      { path: "solo/import", lazy: () => import("./screens/SoloImportScreen").then((m) => ({ Component: m.SoloImportScreen })) },
      { path: "solo/play", lazy: () => import("./screens/SoloPlayScreen").then((m) => ({ Component: m.SoloPlayScreen })) },
      { path: "join", lazy: () => import("./screens/JoinScreen").then((m) => ({ Component: m.JoinScreen })) },
      { path: "daily/leaderboard", lazy: () => import("./screens/DailyLeaderboardScreen").then((m) => ({ Component: m.DailyLeaderboardScreen })) },
      { path: "host-game/name", lazy: () => import("./screens/HostNameScreen").then((m) => ({ Component: m.HostNameScreen })) },
      { path: "host-game/import", lazy: () => import("./screens/HostImportScreen").then((m) => ({ Component: m.HostImportScreen })) },
      { path: "lobby/:gameId", lazy: () => import("./screens/LobbyScreen").then((m) => ({ Component: m.LobbyScreen })) },
      { path: "play/:gameId", lazy: () => import("./screens/MultiplayerPlayScreen").then((m) => ({ Component: m.MultiplayerPlayScreen })) },
      { path: "puzzle-ready", lazy: () => import("./screens/PuzzleReadyScreen").then((m) => ({ Component: m.PuzzleReadyScreen })) },
      { path: "challenge", lazy: () => import("./screens/ChallengeScreen").then((m) => ({ Component: m.ChallengeScreen })) },
      { path: "importing", lazy: () => import("./screens/ImportingScreen").then((m) => ({ Component: m.ImportingScreen })) },
      { path: "rejoin", lazy: () => import("./screens/RejoinScreen").then((m) => ({ Component: m.RejoinScreen })) },
    ],
  },
  {
    path: "/host",
    Component: HostLayout,
    children: [
      { index: true, Component: HostIndexRedirect },
      { path: "import", lazy: () => import("./screens/host/HostImportScreen").then((m) => ({ Component: m.HostImportScreen })) },
      { path: "lobby/:gameId", lazy: () => import("./screens/host/HostLobbyScreen").then((m) => ({ Component: m.HostLobbyScreen })) },
      { path: "spectate/:gameId", lazy: () => import("./screens/host/HostSpectateScreen").then((m) => ({ Component: m.HostSpectateScreen })) },
      { path: "puzzle-ready", lazy: () => import("./screens/host/HostPuzzleReadyScreen").then((m) => ({ Component: m.HostPuzzleReadyScreen })) },
      { path: "importing", lazy: () => import("./screens/host/HostImportingScreen").then((m) => ({ Component: m.HostImportingScreen })) },
      { path: "rejoin", lazy: () => import("./screens/host/HostRejoinScreen").then((m) => ({ Component: m.HostRejoinScreen })) },
    ],
  },
]);
