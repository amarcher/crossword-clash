/**
 * The code-split screen modules, shared by the route config (router.tsx) and
 * prefetch-on-intent. Both call the SAME import function, so the browser's
 * module map dedupes them: a chunk warmed by `prefetchRoute` is already there
 * when the route's `lazy` asks for it.
 */
export const screenModules = {
  spectator: () => import("./screens/SpectatorScreen"),
  privacy: () => import("./screens/legal/PrivacyScreen"),
  terms: () => import("./screens/legal/TermsScreen"),
  support: () => import("./screens/legal/SupportScreen"),
  copyright: () => import("./screens/legal/CopyrightScreen"),
  studio: () => import("./screens/StudioScreen"),
  // The small gate in front of the studio; it lazy-loads `studio` itself once the visitor may enter.
  studioGate: () => import("./screens/StudioGateScreen"),
  nytImport: () => import("./screens/NytImportScreen"),
  soloImport: () => import("./screens/SoloImportScreen"),
  soloPlay: () => import("./screens/SoloPlayScreen"),
  join: () => import("./screens/JoinScreen"),
  dailyLeaderboard: () => import("./screens/DailyLeaderboardScreen"),
  dailyPuzzle: () => import("./screens/DailyPuzzleScreen"),
  puzzlePicker: () => import("./screens/PuzzlePickerScreen"),
  // The archive's calendar needs the daily index on its first frame, so the
  // published months load with the chunk (and on intent).
  archive: () =>
    Promise.all([
      import("./screens/ArchiveScreen"),
      Promise.all([import("./lib/dailyIndex"), import("./lib/soloStats")]).then(([index, stats]) =>
        index.prefetchDailyIndex(stats.dayKey(new Date())),
      ),
    ]).then(([screen]) => screen),
  // The account page lists the puzzles in progress by name, so the daily
  // index loads with its chunk, as /archive's does.
  account: () =>
    Promise.all([
      import("./screens/AccountScreen"),
      Promise.all([import("./lib/dailyIndex"), import("./lib/soloStats")]).then(([index, stats]) =>
        index.prefetchDailyIndex(stats.dayKey(new Date())),
      ),
    ]).then(([screen]) => screen),
  communityBrowse: () => import("./screens/CommunityBrowseScreen"),
  communityPuzzle: () => import("./screens/CommunityPuzzleScreen"),
  race: () => import("./screens/RaceScreen"),
  friends: () => import("./screens/FriendsScreen"),
  hostName: () => import("./screens/HostNameScreen"),
  hostImport: () => import("./screens/HostImportScreen"),
  lobby: () => import("./screens/LobbyScreen"),
  multiplayerPlay: () => import("./screens/MultiplayerPlayScreen"),
  puzzleReady: () => import("./screens/PuzzleReadyScreen"),
  challenge: () => import("./screens/ChallengeScreen"),
  importing: () => import("./screens/ImportingScreen"),
  rejoin: () => import("./screens/RejoinScreen"),
  tvImport: () => import("./screens/host/HostImportScreen"),
  tvLobby: () => import("./screens/host/HostLobbyScreen"),
  tvSpectate: () => import("./screens/host/HostSpectateScreen"),
  tvPuzzleReady: () => import("./screens/host/HostPuzzleReadyScreen"),
  tvImporting: () => import("./screens/host/HostImportingScreen"),
  tvRejoin: () => import("./screens/host/HostRejoinScreen"),
};

type Loader = () => Promise<unknown>;

/**
 * Path prefix → module. A path matches the longest prefix that equals it or
 * precedes a "/" (so "/daily/leaderboard/large" and "/lobby/abc" resolve).
 * Paths with no entry ("/", "/menu", "/host") are statically bundled.
 */
const ROUTE_LOADERS: Record<string, Loader> = {
  "/watch": screenModules.spectator,
  "/privacy": screenModules.privacy,
  "/terms": screenModules.terms,
  "/support": screenModules.support,
  "/copyright": screenModules.copyright,
  "/studio": screenModules.studioGate,
  "/nyt-import": screenModules.nytImport,
  "/solo/import": screenModules.soloImport,
  "/solo/play": screenModules.soloPlay,
  "/join": screenModules.join,
  "/daily/leaderboard": screenModules.dailyLeaderboard,
  "/daily": screenModules.dailyPuzzle,
  "/archive": screenModules.archive,
  "/account": screenModules.account,
  // One prefix for both community chunks: a link to a page or the list warms the pair (both are small).
  "/puzzles": () => Promise.all([screenModules.communityBrowse(), screenModules.communityPuzzle()]),
  "/pick-puzzle": screenModules.puzzlePicker,
  // One prefix for both friends chunks: the hub links the list and both are small.
  "/race": () => Promise.all([screenModules.race(), screenModules.friends()]),
  "/host-game/name": screenModules.hostName,
  "/host-game/import": screenModules.hostImport,
  "/lobby": screenModules.lobby,
  "/play": screenModules.multiplayerPlay,
  "/puzzle-ready": screenModules.puzzleReady,
  "/challenge": screenModules.challenge,
  "/importing": screenModules.importing,
  "/rejoin": screenModules.rejoin,
  "/host/import": screenModules.tvImport,
  "/host/lobby": screenModules.tvLobby,
  "/host/spectate": screenModules.tvSpectate,
  "/host/puzzle-ready": screenModules.tvPuzzleReady,
  "/host/importing": screenModules.tvImporting,
  "/host/rejoin": screenModules.tvRejoin,
};

export interface RoutePrefetcher {
  /** Starts loading the route's chunk (once per route); null when the route has none. */
  prefetch(path: string): Promise<void> | null;
  /** True once the route's chunk has loaded, or when it has none to load. */
  isLoaded(path: string): boolean;
}

/** Exposed for tests; the app uses the singleton below. */
export function createRoutePrefetcher(loaders: Record<string, Loader>): RoutePrefetcher {
  const started = new Map<string, Promise<void>>();
  const loaded = new Set<string>();

  const keyFor = (path: string): string | null => {
    const clean = path.split(/[?#]/, 1)[0];
    let best: string | null = null;
    for (const key of Object.keys(loaders)) {
      if ((clean === key || clean.startsWith(`${key}/`)) && (best === null || key.length > best.length)) best = key;
    }
    return best;
  };

  return {
    prefetch(path) {
      const key = keyFor(path);
      if (key === null) return null;
      let promise = started.get(key);
      if (!promise) {
        promise = loaders[key]().then(
          () => {
            loaded.add(key);
          },
          () => {
            // Let the route's own `lazy` retry (and surface the error) later.
            started.delete(key);
          },
        );
        started.set(key, promise);
      }
      return promise;
    },
    isLoaded(path) {
      const key = keyFor(path);
      return key === null || loaded.has(key);
    },
  };
}

const prefetcher = createRoutePrefetcher(ROUTE_LOADERS);

/** Warm a route's code-split chunk on intent (hover, focus, touchstart). */
export const prefetchRoute = prefetcher.prefetch;
export const isRouteLoaded = prefetcher.isLoaded;

/**
 * Event props that warm `path` on intent, for buttons and links that will
 * navigate there: pointer enter (mouse), focus (keyboard) and touch start
 * (a touch fires no pointerenter early enough to matter).
 */
export function prefetchOnIntent(path: string) {
  const warm = () => {
    prefetchRoute(path);
  };
  return { onPointerEnter: warm, onFocus: warm, onTouchStart: warm };
}
