// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The native path: the keep-awake plugin behind the mobile-mode switch, held by
 * a count so one screen handing over to the next never lets the screen sleep.
 * The plugin stub answers every property, `then` included, like a real
 * Capacitor plugin (see nativePluginProxy.test.ts), and records each call.
 */
const calls: string[] = [];
const plugin = new Proxy({}, {
  get(_, prop) {
    if (prop === "$$typeof") return undefined;
    return () => {
      calls.push(String(prop));
      return Promise.resolve();
    };
  },
});

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor-community/keep-awake", () => ({ KeepAwake: plugin }));

type Mod = typeof import("./keepAwake");
let keepScreenAwake: Mod["keepScreenAwake"];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.stubEnv("MODE", "mobile");
  vi.resetModules();
  calls.length = 0;
  // Load the plugin module up front, so the module's own dynamic import of it
  // settles within one tick however busy the test run is.
  await import("@capacitor-community/keep-awake");
  ({ keepScreenAwake } = await import("./keepAwake"));
});

describe("keepScreenAwake in the apps", () => {
  it("keeps the screen on once for any number of holders and lets it sleep after the last", async () => {
    const lobby = keepScreenAwake();
    const narrator = keepScreenAwake();
    await flush();
    expect(calls).toEqual(["keepAwake"]);
    lobby();
    lobby(); // a second call of the same release counts once
    await flush();
    expect(calls).toEqual(["keepAwake"]);
    narrator();
    await flush();
    expect(calls).toEqual(["keepAwake", "allowSleep"]);
  });

  it("never lets the screen sleep across a screen handover (one releases, the next takes it at once)", async () => {
    const lobby = keepScreenAwake();
    await flush();
    lobby();
    const spectate = keepScreenAwake();
    await flush();
    expect(calls).not.toContain("allowSleep");
    expect(calls[calls.length - 1]).toBe("keepAwake");
    spectate();
    await flush();
    expect(calls[calls.length - 1]).toBe("allowSleep");
  });

  it("does not keep the screen on for a holder released before the plugin loaded", async () => {
    keepScreenAwake()();
    await flush();
    expect(calls).not.toContain("keepAwake");
  });

  it("never treats the plugin as a promise", async () => {
    keepScreenAwake()();
    await flush();
    expect(calls).not.toContain("then");
  });
});
