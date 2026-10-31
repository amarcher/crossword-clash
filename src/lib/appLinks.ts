/**
 * Links into the apps. The website's shareable links — a room's QR code and
 * invite link, a daily challenge, a community puzzle — are plain https URLs
 * on crosswordclash.com, so a phone with the app installed used to open them
 * in the browser and the player joined the room on the web (2026-10-30).
 * Now the site publishes `/.well-known/apple-app-site-association` and
 * `/.well-known/assetlinks.json`, the iOS app claims the domain
 * (`applinks:crosswordclash.com` in App.entitlements) and the Android app
 * declares an auto-verified intent filter, so those links open the app
 * instead, and `@capacitor/app` hands the URL to the running webview here.
 *
 * `appLinkTarget` is the pure part: which in-app route a URL means. The
 * plugin is imported dynamically behind the mobile-mode switch, and only its
 * module namespace ever sits in a promise (a Capacitor plugin object answers
 * `then`, see nativePluginProxy.test.ts).
 */

/** The hosts whose links the apps claim; anything else is left alone. */
export const APP_LINK_HOSTS = ["crosswordclash.com", "www.crosswordclash.com"];

export type AppLinkTarget =
  /** An in-app route to navigate to. */
  | { kind: "navigate"; to: string }
  /** A `#puzzle=` / `#import` payload: set as the page hash, which RootLayout already listens for. */
  | { kind: "hash"; hash: string };

const DAILY_PATH = /^\/daily\/\d{4}-\d{2}-\d{2}\/(mini|midi|large)$/;

/** Where a link opened in the app should land, or null for a link the app has no page for. */
export function appLinkTarget(url: string): AppLinkTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !APP_LINK_HOSTS.includes(parsed.hostname)) return null;
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  const query = parsed.searchParams;

  if (parsed.hash.startsWith("#puzzle=") || parsed.hash === "#import") return { kind: "hash", hash: parsed.hash };

  // The room's QR code (/?join=CODE) and its invite link (/share?t=race&code=CODE)
  // both mean the join screen, which reads `?join=`.
  const code = path === "/" ? query.get("join") : path === "/share" && query.get("t") === "race" ? query.get("code") : null;
  if (code) return { kind: "navigate", to: `/join?join=${encodeURIComponent(code.trim().toUpperCase())}` };

  if (path === "/join") return { kind: "navigate", to: path + parsed.search };
  if (DAILY_PATH.test(path)) return { kind: "navigate", to: path + parsed.search };
  if (path === "/puzzles" || path.startsWith("/puzzles/")) return { kind: "navigate", to: path + parsed.search };
  // The plain home link, or an invite with no code: the menu.
  if (path === "/" || path === "/share" || path === "/menu") return { kind: "navigate", to: "/menu" };
  return null;
}

type AppModule = typeof import("@capacitor/app");

/**
 * Starts listening for links opened into the app and hands each one's target
 * to `handle`. A link that launched the app from cold is read once from
 * `getLaunchUrl` (the `appUrlOpen` event can fire before the webview is
 * listening). Returns a stop function. A no-op outside the apps.
 */
export function startAppLinks(handle: (target: AppLinkTarget) => void): () => void {
  if (import.meta.env.MODE !== "mobile") return () => {};
  let stopped = false;
  // The launch URL, once handled, so the event for the same open is not handled twice.
  let launchUrl: string | null = null;
  const open = (url: string | null | undefined) => {
    if (stopped || !url) return;
    const target = appLinkTarget(url);
    if (target) handle(target);
  };
  const sdk: Promise<AppModule> = import("@capacitor/app");
  const listener = sdk.then((m) =>
    m.App.addListener("appUrlOpen", (event) => {
      if (event.url === launchUrl) {
        launchUrl = null;
        return;
      }
      open(event.url);
    }),
  );
  listener
    .then(() => sdk)
    .then((m) => m.App.getLaunchUrl())
    .then((launch) => {
      if (!launch?.url || stopped) return;
      launchUrl = launch.url;
      open(launch.url);
    })
    .catch((err: unknown) => console.warn("App links: could not read the launch URL", err));
  return () => {
    stopped = true;
    listener.then((handle) => handle.remove()).catch(() => undefined);
  };
}
