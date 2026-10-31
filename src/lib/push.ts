/**
 * Push notifications in the NATIVE apps (docs/friends-spec.md §3.3): the
 * launch switch, the `@capacitor/push-notifications` wrapper, the device
 * token's registration row and the player's preferences. Nothing here runs on
 * the web (`pushAvailable()` is false there), and the OS permission prompt is
 * only ever shown by `enablePush()`, which the settings switches call after
 * the player turned one on: never on launch.
 *
 * The plugin is imported dynamically behind the mobile-mode switch, like
 * appUpdate.ts, and the same hard rule applies: no promise here may ever
 * resolve with the plugin object (a Capacitor plugin is a Proxy that answers
 * `then`, so such a promise never settles). The module namespace is what the
 * promises carry; `.PushNotifications` is read off it synchronously.
 */
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabaseClient";
import { appLinkTarget, type AppLinkTarget } from "./appLinks";
import { DEFAULT_PUSH_PREFS, pushLocale, type PushPrefs } from "./pushRules";

type PushModule = typeof import("@capacitor/push-notifications");

/** VITE_PUSH=1: the settings, the reminder switch and the registration exist only with it. */
export function pushEnabled(env: { VITE_PUSH?: string } = import.meta.env as { VITE_PUSH?: string }): boolean {
  return env.VITE_PUSH === "1";
}

/** The switch is on and this is a native build on a phone. */
export function pushAvailable(): boolean {
  return pushEnabled() && import.meta.env.MODE === "mobile" && Capacitor.isNativePlatform();
}

/** localStorage: the token this device last registered, so sign-out and a re-registration can find its row. */
export const PUSH_TOKEN_KEY = "crossword-clash:push-token";

/** The Android notification channel (`fcmMessage` names it; the manifest's default points at it too). */
export const PUSH_CHANNEL_ID = "crossword-clash";

export type PushPermission = "granted" | "denied" | "prompt";

let sdk: Promise<PushModule> | null = null;
function loadSdk(): Promise<PushModule> {
  if (!sdk) sdk = import("@capacitor/push-notifications");
  return sdk;
}

/** Test seam: forget the loaded module and any listeners. */
export function resetPushForTests(): void {
  sdk = null;
}

function toPermission(state: string): PushPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

export async function checkPushPermission(): Promise<PushPermission> {
  if (!pushAvailable()) return "denied";
  const m = await loadSdk();
  const status = await m.PushNotifications.checkPermissions();
  return toPermission(status.receive);
}

/** Shows the OS prompt (the first time only; iOS never asks twice). */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushAvailable()) return "denied";
  const m = await loadSdk();
  const status = await m.PushNotifications.requestPermissions();
  return toPermission(status.receive);
}

function platform(): "ios" | "android" {
  return Capacitor.getPlatform() === "ios" ? "ios" : "android";
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Registers with the store and writes the token to `device_tokens` for the
 * session user (anonymous included). Resolves with the token, or null when
 * the store never answered (`registrationError`, or 10 s without a token).
 */
export async function registerPushToken(userId: string, opts: { locale?: string; appVersion?: string } = {}): Promise<string | null> {
  if (!pushAvailable() || !supabase) return null;
  const m = await loadSdk();
  const push = m.PushNotifications;
  // Android: the channel the sender names (FCM `channel_id`) must exist on the device.
  if (platform() === "android") {
    await push.createChannel({ id: PUSH_CHANNEL_ID, name: "Crossword Clash", importance: 4 }).catch(() => undefined);
  }
  const token = await new Promise<string | null>((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 10_000);
    void push.addListener("registration", (t) => done(t.value));
    void push.addListener("registrationError", () => done(null));
    push.register().catch(() => done(null));
  });
  if (!token) return null;
  const row = {
    user_id: userId,
    platform: platform(),
    token,
    app_version: opts.appVersion ?? null,
    locale: pushLocale(opts.locale),
    timezone: deviceTimezone(),
    last_seen_at: new Date().toISOString(),
    failed_at: null,
  };
  const { error } = await supabase.from("device_tokens").upsert(row, { onConflict: "token" });
  if (error) console.warn("Push: could not store the device token", error.message);
  try {
    localStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {
    // The row still exists; a later registration upserts by token.
  }
  return token;
}

/** Sign-out or "turn everything off": delete this device's row and forget the token. */
export async function unregisterPushToken(): Promise<void> {
  let token: string | null;
  try {
    token = localStorage.getItem(PUSH_TOKEN_KEY);
    localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    token = null;
  }
  if (!token || !supabase) return;
  await supabase.from("device_tokens").delete().eq("token", token);
}

/**
 * The settings switches' one path to the OS prompt: ask (first time only),
 * then register. Returns the permission so the switch can say "Turned off in
 * Settings" after a denial.
 */
export async function enablePush(userId: string, opts: { locale?: string; appVersion?: string } = {}): Promise<PushPermission> {
  const permission = await requestPushPermission();
  if (permission === "granted") await registerPushToken(userId, opts);
  return permission;
}

/**
 * Listens for a tap on a notification and hands its link to `handle` as the
 * app link it is (`appLinkTarget`), so a tap and a universal link take the
 * same path. A no-op outside the apps. Returns a stop function.
 */
export function startPushTaps(handle: (target: AppLinkTarget) => void): () => void {
  if (!pushAvailable()) return () => {};
  let stopped = false;
  const listener = loadSdk().then((m) =>
    m.PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      if (stopped) return;
      const url = (action.notification.data as { url?: unknown } | undefined)?.url;
      if (typeof url !== "string") return;
      const target = appLinkTarget(url);
      if (target) handle(target);
    }),
  );
  return () => {
    stopped = true;
    listener.then((h) => h.remove()).catch(() => undefined);
  };
}

// --- Preferences ----------------------------------------------------------

export type { PushPrefs };

export async function fetchPushPrefs(userId: string): Promise<PushPrefs | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    daily_reminder: data.daily_reminder,
    daily_reminder_hour: data.daily_reminder_hour,
    room_invites: data.room_invites,
    friend_requests: data.friend_requests,
    quiet_hours: data.quiet_hours,
    quiet_start: data.quiet_start,
    quiet_end: data.quiet_end,
    quiet_allow_invites: data.quiet_allow_invites,
    timezone: data.timezone,
  };
}

/** Upserts the player's row, stamping the device's time zone so the hour means local time. */
export async function savePushPrefs(userId: string, prefs: Partial<PushPrefs>): Promise<PushPrefs> {
  const next: PushPrefs = { ...DEFAULT_PUSH_PREFS, ...prefs, timezone: deviceTimezone() };
  if (!supabase) return next;
  const { error } = await supabase.from("notification_preferences").upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  return next;
}
