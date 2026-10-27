import { useState } from "react";
import { Navigate, type RouteObject } from "react-router";
import { SiteFrame } from "./layouts/SiteFrame";
import { RootLayout } from "./layouts/RootLayout";
import { HostLayout } from "./layouts/HostLayout";
import { screenModules as m } from "./routeModules";
import { studioRouteEnabled } from "./lib/studioGate";
import { communityEnabled } from "./lib/community";
import { RouteErrorScreen } from "./screens/RouteErrorScreen";
import { NotFoundScreen } from "./screens/NotFoundScreen";

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
  // Only a puzzle present when "/" first rendered (the bookmarklet/share hash,
  // consumed by GameProvider init) routes to /puzzle-ready. At "/" this
  // component also renders the menu, and it stays mounted while a lazy route
  // loads — so a puzzle handed to the host flow afterwards (e.g. "Race
  // friends") must not be hijacked into /puzzle-ready.
  const [landingPuzzle] = useState(() => game.urlPuzzle);
  const [landingChallenge] = useState(() => game.urlChallenge);

  // Check for URL puzzle (hash already consumed by GameProvider init)
  if (landingPuzzle && game.urlPuzzle) {
    // A challenge deep link carries the challenger's name + ghost time alongside
    // the puzzle — land on the accept screen instead of the plain mode picker.
    if (landingChallenge) {
      return <Navigate to="/challenge" replace />;
    }
    return <Navigate to="/puzzle-ready" replace />;
  }

  // Check for import hash
  if (hasImportHash()) {
    return <Navigate to="/importing" replace />;
  }

  // Check for ?join= query param (no window during the build-time prerender)
  const search = typeof window === "undefined" ? "" : window.location.search;
  if (new URLSearchParams(search).get("join")) {
    return <Navigate to={`/join${search}`} replace />;
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

export { IndexRedirect, HostIndexRedirect };

// Note: /install-bookmarklet is served by the static file at
// public/install-bookmarklet/index.html (generated from
// bookmarklet/install-page.html by scripts/build-bookmarklet.mjs).
// It is intentionally NOT a React route — see PR #36 for the Safe
// Browsing rationale. Edit the HTML template, not React.
//
// The route objects live apart from the browser router (router.tsx) so the
// build-time prerender (src/entry-server.tsx) can run the same tree through a
// static router in Node.
export const routes: RouteObject[] = [
  {
    // Pathless frame around EVERY route (the legal pages and /host live outside
    // RootLayout's providers on purpose): scroll restoration + the pending bar.
    Component: SiteFrame,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: "/watch/:code?", errorElement: <RouteErrorScreen />, lazy: () => m.spectator().then((s) => ({ Component: s.SpectatorScreen })) },
      // Static legal pages: top-level so they skip the game/auth providers (no
      // anonymous sign-in just to read a policy).
      { path: "/privacy", errorElement: <RouteErrorScreen />, lazy: () => m.privacy().then((s) => ({ Component: s.PrivacyScreen })) },
      { path: "/terms", errorElement: <RouteErrorScreen />, lazy: () => m.terms().then((s) => ({ Component: s.TermsScreen })) },
      { path: "/support", errorElement: <RouteErrorScreen />, lazy: () => m.support().then((s) => ({ Component: s.SupportScreen })) },
      // Construction studio: a Plus feature on the web (gated by StudioGateScreen,
      // which loads the editor only once the gate passes); dev and VITE_STUDIO
      // builds skip the gate; the apps have no route (src/lib/studioGate.ts).
      ...(studioRouteEnabled()
        ? [{ path: "/studio", errorElement: <RouteErrorScreen />, lazy: () => m.studioGate().then((s) => ({ Component: s.StudioGateScreen })) }]
        : []),
      {
        path: "/",
        Component: RootLayout,
        errorElement: <RouteErrorScreen />,
        children: [
          { index: true, Component: IndexRedirect },
          { path: "menu", Component: MenuScreen },
          { path: "nyt-import", lazy: () => m.nytImport().then((s) => ({ Component: s.NytImportScreen })) },
          { path: "solo/import", lazy: () => m.soloImport().then((s) => ({ Component: s.SoloImportScreen })) },
          { path: "solo/play", lazy: () => m.soloPlay().then((s) => ({ Component: s.SoloPlayScreen })) },
          { path: "join", lazy: () => m.join().then((s) => ({ Component: s.JoinScreen })) },
          { path: "daily/leaderboard/:slot?", lazy: () => m.dailyLeaderboard().then((s) => ({ Component: s.DailyLeaderboardScreen })) },
          // A day's daily by date + slot (the short challenge link); the static
          // "leaderboard" segment above outranks the :day param.
          { path: "daily/:day/:slot", lazy: () => m.dailyPuzzle().then((s) => ({ Component: s.DailyPuzzleScreen })) },
          { path: "classics", lazy: () => m.classics().then((s) => ({ Component: s.ClassicLibraryScreen })) },
          { path: "pick-puzzle", lazy: () => m.puzzlePicker().then((s) => ({ Component: s.PuzzlePickerScreen })) },
          { path: "host-game/name", lazy: () => m.hostName().then((s) => ({ Component: s.HostNameScreen })) },
          { path: "host-game/import", lazy: () => m.hostImport().then((s) => ({ Component: s.HostImportScreen })) },
          { path: "lobby/:gameId", lazy: () => m.lobby().then((s) => ({ Component: s.LobbyScreen })) },
          { path: "play/:gameId", lazy: () => m.multiplayerPlay().then((s) => ({ Component: s.MultiplayerPlayScreen })) },
          { path: "puzzle-ready", lazy: () => m.puzzleReady().then((s) => ({ Component: s.PuzzleReadyScreen })) },
          { path: "challenge", lazy: () => m.challenge().then((s) => ({ Component: s.ChallengeScreen })) },
          { path: "importing", lazy: () => m.importing().then((s) => ({ Component: s.ImportingScreen })) },
          { path: "rejoin", lazy: () => m.rejoin().then((s) => ({ Component: s.RejoinScreen })) },
          // Past dailies with the viewer's own times (docs/puzzle-archive-spec.md).
          { path: "archive", lazy: () => m.archive().then((s) => ({ Component: s.ArchiveScreen })) },
          // The signed-in solver's page: identity, Plus, streaks, recent solves, puzzles in progress.
          { path: "account", lazy: () => m.account().then((s) => ({ Component: s.AccountScreen })) },
          // Community puzzles (docs/community-puzzles-spec.md), behind the launch switch: browse, an author's list, one puzzle's page.
          ...(communityEnabled()
            ? [
                { path: "puzzles", lazy: () => m.communityBrowse().then((s) => ({ Component: s.CommunityBrowseScreen })) },
                { path: "puzzles/by/:username", lazy: () => m.communityBrowse().then((s) => ({ Component: s.CommunityBrowseScreen })) },
                { path: "puzzles/:shortId", lazy: () => m.communityPuzzle().then((s) => ({ Component: s.CommunityPuzzleScreen })) },
              ]
            : []),
    ],
  },
  {
    path: "/host",
    Component: HostLayout,
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, Component: HostIndexRedirect },
      { path: "import", lazy: () => m.tvImport().then((s) => ({ Component: s.HostImportScreen })) },
      { path: "lobby/:gameId", lazy: () => m.tvLobby().then((s) => ({ Component: s.HostLobbyScreen })) },
      { path: "spectate/:gameId", lazy: () => m.tvSpectate().then((s) => ({ Component: s.HostSpectateScreen })) },
      { path: "puzzle-ready", lazy: () => m.tvPuzzleReady().then((s) => ({ Component: s.HostPuzzleReadyScreen })) },
      { path: "importing", lazy: () => m.tvImporting().then((s) => ({ Component: s.HostImportingScreen })) },
      { path: "rejoin", lazy: () => m.tvRejoin().then((s) => ({ Component: s.HostRejoinScreen })) },
    ],
  },
  { path: "*", Component: NotFoundScreen },
    ],
  },
];
