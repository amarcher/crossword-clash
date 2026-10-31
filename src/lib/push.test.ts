// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The push plugin is loaded through a stub with the one property that
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
const listeners: Record<string, Array<(event: unknown) => void>> = {};

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => platform.name, isNativePlatform: () => platform.native },
}));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: pluginLike(impl, calls) }));

const db = vi.hoisted(() => ({ ops: [] as { table: string; op: string; args: unknown[] }[], result: { data: null as unknown, error: null as unknown } }));
vi.mock("./supabaseClient", () => ({
  supabase: {
    from: (table: string) => {
      const api: Record<string, unknown> = {};
      for (const op of ["upsert", "delete", "eq", "select", "maybeSingle"]) {
        api[op] = (...args: unknown[]) => {
          db.ops.push({ table, op, args });
          if (op === "maybeSingle") return Promise.resolve(db.result);
          return api;
        };
      }
      api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(db.result).then(resolve);
      return api;
    },
  },
}));

const settles = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("never settled")), 1000))]);

type Mod = typeof import("./push");
let mod: Mod;

beforeEach(async () => {
  vi.stubEnv("MODE", "mobile");
  vi.stubEnv("VITE_PUSH", "1");
  calls.length = 0;
  db.ops.length = 0;
  db.result = { data: null, error: null };
  Object.keys(impl).forEach((k) => delete impl[k]);
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  impl.addListener = (name: unknown, cb: unknown) => {
    (listeners[String(name)] ??= []).push(cb as (event: unknown) => void);
    return Promise.resolve({ remove: () => Promise.resolve() });
  };
  localStorage.clear();
  platform.name = "ios";
  platform.native = true;
  mod = await import("./push");
  mod.resetPushForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pushEnabled / pushAvailable", () => {
  it("needs the switch, a mobile build and a native platform", () => {
    expect(mod.pushEnabled({ VITE_PUSH: "1" })).toBe(true);
    expect(mod.pushEnabled({})).toBe(false);
    expect(mod.pushAvailable()).toBe(true);
    platform.native = false;
    expect(mod.pushAvailable()).toBe(false);
  });
});

describe("permissions", () => {
  it("reads and requests the OS permission without ever awaiting the plugin proxy", async () => {
    impl.checkPermissions = async () => ({ receive: "prompt" });
    impl.requestPermissions = async () => ({ receive: "granted" });
    expect(await settles(mod.checkPushPermission())).toBe("prompt");
    expect(await settles(mod.requestPushPermission())).toBe("granted");
    expect(calls).toEqual(["checkPermissions", "requestPermissions"]);
    expect(calls).not.toContain("then");
  });

  it("answers denied on the web without touching the plugin", async () => {
    vi.stubEnv("MODE", "web");
    expect(await settles(mod.checkPushPermission())).toBe("denied");
    expect(calls).toEqual([]);
  });
});

describe("registerPushToken", () => {
  it("registers, stores the token row for the user with platform, locale and time zone, and remembers the token", async () => {
    impl.register = async () => {
      listeners.registration?.forEach((cb) => cb({ value: "apns-token-1234567890" }));
    };
    const token = await settles(mod.registerPushToken("user-1", { locale: "es-MX", appVersion: "1.2.0" }));
    expect(token).toBe("apns-token-1234567890");
    const upsert = db.ops.find((o) => o.op === "upsert")!;
    expect(upsert.table).toBe("device_tokens");
    expect(upsert.args[0]).toMatchObject({ user_id: "user-1", platform: "ios", token: "apns-token-1234567890", locale: "es", app_version: "1.2.0", failed_at: null });
    expect(typeof (upsert.args[0] as { timezone: string }).timezone).toBe("string");
    expect(upsert.args[1]).toEqual({ onConflict: "token" });
    expect(localStorage.getItem("crossword-clash:push-token")).toBe("apns-token-1234567890");
    expect(calls).not.toContain("then");
  });

  it("resolves null on a registration error and writes nothing", async () => {
    impl.register = async () => {
      listeners.registrationError?.forEach((cb) => cb({ error: "no network" }));
    };
    expect(await settles(mod.registerPushToken("user-1"))).toBeNull();
    expect(db.ops).toEqual([]);
  });

  it("enablePush asks first and registers only when granted; unregister deletes the remembered token's row", async () => {
    impl.requestPermissions = async () => ({ receive: "denied" });
    expect(await settles(mod.enablePush("user-1"))).toBe("denied");
    expect(calls).not.toContain("register");
    localStorage.setItem("crossword-clash:push-token", "apns-token-1234567890");
    await settles(mod.unregisterPushToken());
    expect(db.ops.find((o) => o.op === "delete")?.table).toBe("device_tokens");
    expect(db.ops.find((o) => o.op === "eq")?.args).toEqual(["token", "apns-token-1234567890"]);
    expect(localStorage.getItem("crossword-clash:push-token")).toBeNull();
  });
});

describe("startPushTaps", () => {
  it("hands a tapped notification's url to the app-link mapping and stops cleanly", async () => {
    const handle = vi.fn();
    const stop = mod.startPushTaps(handle);
    await settles(Promise.resolve().then(() => new Promise((r) => setTimeout(r, 0))));
    listeners.pushNotificationActionPerformed?.forEach((cb) =>
      cb({ actionId: "tap", notification: { data: { url: "https://crosswordclash.com/?join=KQ7MXB" } } }),
    );
    expect(handle).toHaveBeenCalledWith({ kind: "navigate", to: "/join?join=KQ7MXB" });
    listeners.pushNotificationActionPerformed?.forEach((cb) => cb({ actionId: "tap", notification: { data: { url: "https://evil.example/x" } } }));
    expect(handle).toHaveBeenCalledTimes(1);
    stop();
    expect(calls).not.toContain("then");
  });

  it("is a no-op on the web", () => {
    vi.stubEnv("MODE", "web");
    const stop = mod.startPushTaps(vi.fn());
    stop();
    expect(calls).toEqual([]);
  });
});

describe("preferences", () => {
  it("reads the row into prefs and upserts with the device's time zone", async () => {
    db.result = { data: { user_id: "u", daily_reminder: true, daily_reminder_hour: 7, room_invites: true, friend_requests: false, quiet_hours: true, quiet_start: 22, quiet_end: 8, quiet_allow_invites: true, timezone: "Europe/London", updated_at: "x" }, error: null };
    const prefs = await settles(mod.fetchPushPrefs("u"));
    expect(prefs).toMatchObject({ daily_reminder: true, daily_reminder_hour: 7, friend_requests: false });
    db.result = { data: null, error: null };
    const saved = await settles(mod.savePushPrefs("u", { daily_reminder: true }));
    expect(saved.daily_reminder).toBe(true);
    const upsert = db.ops.find((o) => o.op === "upsert")!;
    expect(upsert.table).toBe("notification_preferences");
    expect(upsert.args[0]).toMatchObject({ user_id: "u", daily_reminder: true, room_invites: true });
  });
});
