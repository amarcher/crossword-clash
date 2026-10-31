// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appLinkTarget } from "./appLinks";

describe("appLinkTarget", () => {
  it("sends the room QR code and the invite link to the join screen", () => {
    expect(appLinkTarget("https://crosswordclash.com/?join=ab12cd")).toEqual({ kind: "navigate", to: "/join?join=AB12CD" });
    expect(appLinkTarget("https://crosswordclash.com/share?t=race&code=XK9Q2M&title=Monday+Mini")).toEqual({ kind: "navigate", to: "/join?join=XK9Q2M" });
    expect(appLinkTarget("https://www.crosswordclash.com/join?join=XK9Q2M")).toEqual({ kind: "navigate", to: "/join?join=XK9Q2M" });
  });

  it("opens a daily challenge and a community puzzle on their own pages", () => {
    expect(appLinkTarget("https://crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer")).toEqual({ kind: "navigate", to: "/daily/2026-10-20/mini?beat=102&by=Archer" });
    expect(appLinkTarget("https://crosswordclash.com/puzzles/a1b2c3d4")).toEqual({ kind: "navigate", to: "/puzzles/a1b2c3d4" });
    expect(appLinkTarget("https://crosswordclash.com/puzzles/by/archer?size=mini")).toEqual({ kind: "navigate", to: "/puzzles/by/archer?size=mini" });
  });

  it("hands a puzzle payload to the hash listener", () => {
    expect(appLinkTarget("https://crosswordclash.com/#puzzle=abc")).toEqual({ kind: "hash", hash: "#puzzle=abc" });
    expect(appLinkTarget("https://crosswordclash.com/#import")).toEqual({ kind: "hash", hash: "#import" });
  });

  it("lands the plain home link and an invite with no code on the menu", () => {
    expect(appLinkTarget("https://crosswordclash.com/")).toEqual({ kind: "navigate", to: "/menu" });
    expect(appLinkTarget("https://crosswordclash.com")).toEqual({ kind: "navigate", to: "/menu" });
    expect(appLinkTarget("https://crosswordclash.com/share?t=result")).toEqual({ kind: "navigate", to: "/menu" });
  });

  it("ignores other hosts, other schemes, unknown pages and junk", () => {
    expect(appLinkTarget("https://example.com/?join=AB12CD")).toBeNull();
    expect(appLinkTarget("http://crosswordclash.com/?join=AB12CD")).toBeNull();
    expect(appLinkTarget("capacitor://localhost/")).toBeNull();
    expect(appLinkTarget("https://crosswordclash.com/daily/leaderboard")).toBeNull();
    expect(appLinkTarget("https://crosswordclash.com/privacy")).toBeNull();
    expect(appLinkTarget("not a url")).toBeNull();
  });
});

/**
 * The native half: a plugin stub that answers EVERY property, `then`
 * included, like a real Capacitor plugin (nativePluginProxy.test.ts); every
 * path must settle without that "then" ever being called.
 */
const calls: string[] = [];
let listeners: ((event: { url: string }) => void)[] = [];
let launchUrl: string | null = null;
let removed = 0;
const plugin = new Proxy(
  {},
  {
    get(_, prop) {
      if (prop === "$$typeof") return undefined;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        if (prop === "addListener") {
          listeners.push(args[1] as (event: { url: string }) => void);
          return Promise.resolve({ remove: () => Promise.resolve(removed++) });
        }
        if (prop === "getLaunchUrl") return Promise.resolve(launchUrl ? { url: launchUrl } : undefined);
        return Promise.resolve();
      };
    },
  },
);
vi.mock("@capacitor/app", () => ({ App: plugin }));

type Mod = typeof import("./appLinks");
let startAppLinks: Mod["startAppLinks"];
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("startAppLinks in the apps", () => {
  beforeEach(async () => {
    vi.stubEnv("MODE", "mobile");
    vi.resetModules();
    calls.length = 0;
    listeners = [];
    launchUrl = null;
    removed = 0;
    await import("@capacitor/app");
    ({ startAppLinks } = await import("./appLinks"));
  });

  it("routes each opened link and the one that launched the app, never awaiting the plugin", async () => {
    launchUrl = "https://crosswordclash.com/?join=AB12CD";
    const handled: unknown[] = [];
    const stop = startAppLinks((t) => handled.push(t));
    await flush();
    expect(calls).toEqual(["addListener", "getLaunchUrl"]);
    expect(handled).toEqual([{ kind: "navigate", to: "/join?join=AB12CD" }]);
    // The event for the same launch is not handled twice...
    listeners[0]({ url: "https://crosswordclash.com/?join=AB12CD" });
    expect(handled).toHaveLength(1);
    // ...but a later open of the same link is.
    listeners[0]({ url: "https://crosswordclash.com/?join=AB12CD" });
    listeners[0]({ url: "https://crosswordclash.com/privacy" });
    listeners[0]({ url: "https://crosswordclash.com/daily/2026-10-20/mini" });
    expect(handled).toEqual([
      { kind: "navigate", to: "/join?join=AB12CD" },
      { kind: "navigate", to: "/join?join=AB12CD" },
      { kind: "navigate", to: "/daily/2026-10-20/mini" },
    ]);
    stop();
    await flush();
    expect(removed).toBe(1);
    listeners[0]({ url: "https://crosswordclash.com/?join=ZZZZZZ" });
    expect(handled).toHaveLength(3);
    expect(calls).not.toContain("then");
  });

  it("does nothing on the web", async () => {
    vi.stubEnv("MODE", "production");
    vi.resetModules();
    ({ startAppLinks } = await import("./appLinks"));
    const handled: unknown[] = [];
    const stop = startAppLinks((t) => handled.push(t));
    await flush();
    expect(calls).toEqual([]);
    stop();
  });
});
