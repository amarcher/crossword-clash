// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The app-update plugin is loaded through a stub with the one property that
 * matters: like every Capacitor plugin, it answers EVERY property, `then`
 * included, with a native-method wrapper (see nativePluginProxy.test.ts).
 * Every path here must settle without ever calling that "then".
 */
function pluginLike(impl: Record<string, (...args: unknown[]) => unknown>, calls: string[]) {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === "$$typeof") return undefined;
      if (prop === "toJSON") return () => ({});
      return (...args: unknown[]) => {
        calls.push(String(prop));
        const fn = impl[String(prop)];
        return fn ? fn(...args) : new Promise(() => {});
      };
    },
  });
}

const calls: string[] = [];
const impl: Record<string, (...args: unknown[]) => unknown> = {};
const platform = { name: "ios", native: true };

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => platform.name, isNativePlatform: () => platform.native },
}));
vi.mock("@capawesome/capacitor-app-update", () => ({ AppUpdate: pluginLike(impl, calls) }));

const settles = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("never settled")), 1000))]);

type Mod = typeof import("./appUpdate");
let mod: Mod;

const iosInfo = (available: string, current = "1.1.0"): import("./appUpdate").AppUpdateInfo => ({
  currentVersionName: current,
  currentVersionCode: "17",
  availableVersionName: available,
  updateAvailability: 2,
});
const androidInfo = (code: string, immediate = true): import("./appUpdate").AppUpdateInfo => ({
  currentVersionName: "1.1.0",
  currentVersionCode: "5",
  availableVersionCode: code,
  updateAvailability: 2,
  immediateUpdateAllowed: immediate,
  flexibleUpdateAllowed: true,
});

beforeEach(async () => {
  vi.stubEnv("MODE", "mobile");
  platform.name = "ios";
  platform.native = true;
  calls.length = 0;
  Object.keys(impl).forEach((k) => delete impl[k]);
  sessionStorage.clear();
  localStorage.clear();
  mod = await import("./appUpdate");
  mod.resetAppUpdateForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateState", () => {
  it("uses the plugin's own value for UPDATE_AVAILABLE", async () => {
    const real = await vi.importActual<typeof import("@capawesome/capacitor-app-update")>("@capawesome/capacitor-app-update");
    expect(real.AppUpdateAvailability.UPDATE_AVAILABLE).toBe(2);
    expect(mod.updateState({ ...iosInfo("1.2.0"), updateAvailability: real.AppUpdateAvailability.UPDATE_AVAILABLE }).available).toBe(true);
  });

  it("offers a newer store version on iOS by name", () => {
    expect(mod.updateState(iosInfo("1.2.0"))).toEqual({ available: true, version: "1.2.0", immediate: false, key: "1.2.0" });
    expect(mod.updateState(iosInfo("1.10.0"), "1.9.3").available).toBe(true);
  });

  it("never offers the installed version or an older one, whatever the availability flag says", () => {
    expect(mod.updateState(iosInfo("1.1.0"))).toEqual({ available: false });
    expect(mod.updateState(iosInfo("1.0.2"))).toEqual({ available: false });
    // A TestFlight build ahead of the store: the installed version wins.
    expect(mod.updateState(iosInfo("1.1.0"), "1.2.0")).toEqual({ available: false });
    expect(mod.updateState(iosInfo("beta"), "beta")).toEqual({ available: false });
  });

  it("is quiet when the store says no update, the answer is unknown, or there is nothing to name", () => {
    expect(mod.updateState({ ...iosInfo("1.2.0"), updateAvailability: 1 })).toEqual({ available: false });
    expect(mod.updateState({ ...iosInfo("1.2.0"), updateAvailability: 0 })).toEqual({ available: false });
    expect(mod.updateState(null)).toEqual({ available: false });
    expect(mod.updateState({ currentVersionName: "1.1.0", currentVersionCode: "5", updateAvailability: 2 })).toEqual({ available: false });
  });

  it("offers an Android update by version code, with Play's immediate flow when allowed", () => {
    expect(mod.updateState(androidInfo("6"))).toEqual({ available: true, version: undefined, immediate: true, key: "6" });
    expect(mod.updateState(androidInfo("6", false)).immediate).toBe(false);
    expect(mod.updateState(androidInfo("5"))).toEqual({ available: false });
    expect(mod.updateState(androidInfo("4"))).toEqual({ available: false });
  });

  it("compares dotted versions numerically", () => {
    expect(mod.compareVersions("1.10.0", "1.9.2")).toBe(1);
    expect(mod.compareVersions("1.1", "1.1.0")).toBe(0);
    expect(mod.compareVersions("1.0.9", "1.1")).toBe(-1);
    expect(mod.compareVersions("1.x", "1.1")).toBeNull();
  });
});

describe("checkForUpdate", () => {
  it("asks the store once per launch and serves the cached answer until an hour has passed", async () => {
    impl.getAppUpdateInfo = async () => iosInfo("1.2.0");
    const t0 = 1_700_000_000_000;
    await expect(settles(mod.checkForUpdate(t0))).resolves.toEqual({ available: true, version: "1.2.0", immediate: false, key: "1.2.0" });
    await expect(settles(mod.checkForUpdate(t0 + 30 * 60 * 1000))).resolves.toMatchObject({ available: true });
    expect(calls.filter((c) => c === "getAppUpdateInfo")).toHaveLength(1);
    expect(calls).not.toContain("then");
    // The cache lives in sessionStorage: a cold launch starts without it.
    expect(JSON.parse(sessionStorage.getItem(mod.UPDATE_CHECK_KEY)!)).toMatchObject({ checkedAt: t0, state: { available: true } });

    impl.getAppUpdateInfo = async () => ({ ...iosInfo("1.2.0"), updateAvailability: 1 });
    await expect(settles(mod.checkForUpdate(t0 + mod.RECHECK_AFTER_MS))).resolves.toEqual({ available: false });
    expect(calls.filter((c) => c === "getAppUpdateInfo")).toHaveLength(2);
  });

  it("treats a failed ask as no update and caches that too", async () => {
    impl.getAppUpdateInfo = async () => { throw new Error("no Play services"); };
    await expect(settles(mod.checkForUpdate(1000))).resolves.toEqual({ available: false });
    await expect(settles(mod.checkForUpdate(2000))).resolves.toEqual({ available: false });
    expect(calls.filter((c) => c === "getAppUpdateInfo")).toHaveLength(1);
  });

  it("ignores a cache it cannot read", async () => {
    sessionStorage.setItem(mod.UPDATE_CHECK_KEY, "{not json");
    impl.getAppUpdateInfo = async () => iosInfo("1.2.0");
    await expect(settles(mod.checkForUpdate())).resolves.toMatchObject({ available: true });
    sessionStorage.setItem(mod.UPDATE_CHECK_KEY, JSON.stringify({ checkedAt: "soon" }));
    await expect(settles(mod.checkForUpdate())).resolves.toMatchObject({ available: true });
    expect(calls.filter((c) => c === "getAppUpdateInfo")).toHaveLength(2);
  });

  it("never asks on the web or outside a native platform", async () => {
    vi.stubEnv("MODE", "production");
    await expect(settles(mod.checkForUpdate())).resolves.toBeNull();
    vi.stubEnv("MODE", "mobile");
    platform.native = false;
    await expect(settles(mod.checkForUpdate())).resolves.toBeNull();
    expect(calls).toEqual([]);
    expect(sessionStorage.getItem(mod.UPDATE_CHECK_KEY)).toBeNull();
  });
});

describe("dismissal", () => {
  it("remembers Later per version in localStorage until a different version is live", () => {
    const state = mod.updateState(iosInfo("1.2.0"));
    expect(mod.isDismissed(state)).toBe(false);
    mod.dismissUpdate(state.key!);
    expect(localStorage.getItem(mod.UPDATE_DISMISSED_KEY)).toBe("1.2.0");
    expect(mod.isDismissed(state)).toBe(true);
    expect(mod.isDismissed(mod.updateState(iosInfo("1.3.0")))).toBe(false);
    expect(mod.isDismissed({ available: false })).toBe(false);
  });
});

describe("openUpdate", () => {
  it("opens the App Store page on iOS with the app's Apple ID", async () => {
    let opened: unknown;
    impl.openAppStore = async (o: unknown) => { opened = o; };
    await settles(mod.openUpdate(mod.updateState(iosInfo("1.2.0"))));
    expect(opened).toEqual({ appId: mod.IOS_APP_ID });
    expect(calls).not.toContain("performImmediateUpdate");
    expect(calls).not.toContain("then");
  });

  it("runs Play's immediate flow on Android when allowed, and the store page otherwise or when the flow fails", async () => {
    platform.name = "android";
    impl.performImmediateUpdate = async () => ({ code: 0 });
    impl.openAppStore = async () => undefined;
    await settles(mod.openUpdate(mod.updateState(androidInfo("6"))));
    expect(calls).toEqual(["performImmediateUpdate"]);

    calls.length = 0;
    impl.performImmediateUpdate = async () => ({ code: 1 }); // the player cancelled: that is their answer
    await settles(mod.openUpdate(mod.updateState(androidInfo("6"))));
    expect(calls).toEqual(["performImmediateUpdate"]);

    calls.length = 0;
    impl.performImmediateUpdate = async () => ({ code: 5 }); // INFO_MISSING etc.: fall back to the store page
    await settles(mod.openUpdate(mod.updateState(androidInfo("6"))));
    expect(calls).toEqual(["performImmediateUpdate", "openAppStore"]);

    calls.length = 0;
    await settles(mod.openUpdate(mod.updateState(androidInfo("6", false))));
    expect(calls).toEqual(["openAppStore"]);
    expect(calls).not.toContain("then");
  });
});
