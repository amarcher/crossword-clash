// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The apps' path: the haptics plugin behind the mobile-mode switch. The stub
 * answers every property, `then` included, like a real Capacitor plugin (see
 * nativePluginProxy.test.ts): the module must never hand it to a promise.
 */
const calls: { method: string; args: unknown[] }[] = [];
const plugin = new Proxy({}, {
  get(_, prop) {
    if (prop === "$$typeof") return undefined;
    return (...args: unknown[]) => {
      calls.push({ method: String(prop), args });
      return Promise.resolve();
    };
  },
});
let nativePlatform = true;
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => nativePlatform } }));
vi.mock("@capacitor/haptics", () => ({ Haptics: plugin, NotificationType: { Error: "ERROR", Success: "SUCCESS", Warning: "WARNING" } }));

type Mod = typeof import("./haptics");
let haptics: Mod;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.stubEnv("MODE", "mobile");
  vi.resetModules();
  calls.length = 0;
  nativePlatform = true;
  await import("@capacitor/haptics");
  haptics = await import("./haptics");
});

describe("haptics in the apps", () => {
  it("is always available and plays the system's error pattern, never awaiting the plugin object", async () => {
    expect(haptics.hapticsAvailable()).toBe(true);
    haptics.wrongLetterHaptic();
    haptics.wrongLetterHaptic();
    await flush();
    expect(calls).toEqual([
      { method: "notification", args: [{ type: "ERROR" }] },
      { method: "notification", args: [{ type: "ERROR" }] },
    ]);
    expect(calls.some((c) => c.method === "then")).toBe(false);
  });

  it("a mobile build opened in a plain browser falls back to the web rule", async () => {
    nativePlatform = false;
    expect(haptics.hapticsAvailable()).toBe(false);
    haptics.wrongLetterHaptic();
    await flush();
    expect(calls).toEqual([]);
  });
});
