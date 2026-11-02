/**
 * "Update available" for the NATIVE apps: whenever a newer build is live in
 * the App Store / Google Play, the menu offers the update (owner's ask of
 * 2026-10-28: offer updates from the get-go). Nothing here runs on the web.
 *
 * The store is asked through `@capawesome/capacitor-app-update`:
 *  - Android: Play's in-app update API answers with `updateAvailability` and
 *    whether an *immediate* update (Play's full-screen flow) is allowed; the
 *    available version arrives as a `versionCode` only, never a name.
 *  - iOS: the plugin looks the bundle id up on iTunes and compares the
 *    installed `CFBundleShortVersionString` with the store's; the button
 *    opens the App Store page (`appId` is required there).
 *
 * Rules: the store is asked at most once per app launch (the answer is cached
 * in sessionStorage, which a cold launch starts empty) and again when the app
 * comes back to the foreground after an hour; a tap on "Later" remembers the
 * dismissed version in localStorage so nobody is nagged until the next one.
 *
 * The plugin is imported dynamically behind the mobile-mode switch, like
 * nativePurchase.ts, and the same hard rule applies: no promise here may ever
 * resolve with the plugin object (a Capacitor plugin is a Proxy that answers
 * `then`, so such a promise never settles). The module namespace is what the
 * promises carry; `.AppUpdate` is read off it synchronously.
 */
import { Capacitor } from "@capacitor/core";

type AppUpdateModule = typeof import("@capawesome/capacitor-app-update");
export type AppUpdateInfo = import("@capawesome/capacitor-app-update").AppUpdateInfo;

/** The App Store's Apple ID for the app (docs/testflight/README.md); `openAppStore` needs it on iOS. */
export const IOS_APP_ID = "6811111993";

/** localStorage: the version key the player dismissed with "Later". */
export const UPDATE_DISMISSED_KEY = "crossword-clash:update-dismissed";
/** sessionStorage: the last answer and when the store was asked. */
export const UPDATE_CHECK_KEY = "crossword-clash:update-check";
/** How old a cached answer may be before a return to the foreground asks the store again. */
export const RECHECK_AFTER_MS = 60 * 60 * 1000;

// `AppUpdateAvailability.UPDATE_AVAILABLE` from the plugin. Spelled out so the
// plugin's enum needs no runtime import here (that would pull it into the web
// bundle); appUpdate.test.ts checks the value against the real enum.
const UPDATE_AVAILABLE = 2;
// `AppUpdateResultCode`: OK and CANCELED are the user's answer to Play's immediate flow; anything else falls back to the store page.
const RESULT_OK = 0;
const RESULT_CANCELED = 1;

export interface UpdateState {
  /** A newer build than the installed one is live in the store. */
  available: boolean;
  /** The store's version name, when the platform says it (iOS does, Android answers with a code only). */
  version?: string;
  /** Android: Play allows its full-screen immediate update flow for this update. */
  immediate?: boolean;
  /** Identifies the available version for the dismissal memory (name, else code). */
  key?: string;
}

/** Dotted numeric compare ("1.10.0" > "1.9.2"); null when either side isn't a dotted number. */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v.trim()) ? v.trim().split(".").map(Number) : null);
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * What the plugin's answer means for the banner. Pure. `installedVersion`
 * defaults to the plugin's own `currentVersionName`; whichever it is, an
 * available version that is not newer than it is never offered (a phased
 * release or a stale lookup must not suggest reinstalling the same build).
 */
export function updateState(info: AppUpdateInfo | null | undefined, installedVersion?: string): UpdateState {
  if (!info || info.updateAvailability !== UPDATE_AVAILABLE) return { available: false };
  const installed = installedVersion ?? info.currentVersionName;
  const name = info.availableVersionName?.trim() || undefined;
  if (name) {
    const cmp = installed ? compareVersions(name, installed) : null;
    if (cmp !== null && cmp <= 0) return { available: false };
    if (cmp === null && name === installed) return { available: false };
  }
  const code = info.availableVersionCode?.trim() || undefined;
  if (code && info.currentVersionCode) {
    const cmp = compareVersions(code, info.currentVersionCode);
    if (cmp !== null && cmp <= 0) return { available: false };
  }
  const key = name ?? code;
  if (!key) return { available: false };
  return { available: true, version: name, immediate: !!info.immediateUpdateAllowed, key };
}

/** Whether this build can ask a store at all: the native app, never the web. */
export function appUpdateAvailable(): boolean {
  return import.meta.env.MODE === "mobile" && Capacitor.isNativePlatform();
}

let sdk: Promise<AppUpdateModule> | null = null;

/** The plugin module; callers read `.AppUpdate` off it synchronously (see the header). */
async function sdkModule(): Promise<AppUpdateModule> {
  // The static switch lets Rollup drop the import (and the plugin's chunk) from web builds.
  if (import.meta.env.MODE !== "mobile") throw new Error("App updates are only checked in the apps.");
  if (!sdk) sdk = import("@capawesome/capacitor-app-update");
  return sdk;
}

interface CachedCheck {
  checkedAt: number;
  state: UpdateState;
}

function storage(kind: "session" | "local"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** The cached answer of this launch, or null when there is none or it is unreadable. */
export function readCachedCheck(): CachedCheck | null {
  try {
    const raw = storage("session")?.getItem(UPDATE_CHECK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCheck>;
    if (typeof parsed.checkedAt !== "number" || !parsed.state || typeof parsed.state.available !== "boolean") return null;
    return { checkedAt: parsed.checkedAt, state: parsed.state };
  } catch {
    return null;
  }
}

function writeCachedCheck(check: CachedCheck): void {
  try {
    storage("session")?.setItem(UPDATE_CHECK_KEY, JSON.stringify(check));
  } catch {
    /* storage full or unavailable: the next check simply asks again */
  }
}

/**
 * The update state for this launch: the cached answer while it is under
 * `RECHECK_AFTER_MS` old, else a fresh ask of the store (a failed ask counts
 * as "no update" and is cached like any answer, so a store that is down is
 * not asked again until the next hour or launch). Null on the web.
 */
export async function checkForUpdate(now = Date.now()): Promise<UpdateState | null> {
  if (!appUpdateAvailable()) return null;
  const cached = readCachedCheck();
  if (cached && now - cached.checkedAt < RECHECK_AFTER_MS) return cached.state;
  let state: UpdateState;
  try {
    const info = await (await sdkModule()).AppUpdate.getAppUpdateInfo();
    state = updateState(info);
  } catch {
    state = { available: false };
  }
  writeCachedCheck({ checkedAt: now, state });
  return state;
}

/** The version key the player dismissed, or null. */
export function dismissedUpdateKey(): string | null {
  try {
    return storage("local")?.getItem(UPDATE_DISMISSED_KEY) || null;
  } catch {
    return null;
  }
}

/** Remembers "Later" for this version; the banner stays away until a different version is live. */
export function dismissUpdate(key: string): void {
  try {
    storage("local")?.setItem(UPDATE_DISMISSED_KEY, key);
  } catch {
    /* without storage the dismissal lasts for the render only */
  }
}

/** Whether the state's version is the one the player already dismissed. */
export function isDismissed(state: UpdateState | null): boolean {
  return !!state?.key && dismissedUpdateKey() === state.key;
}

/**
 * Takes the player to the update: Play's immediate flow where it is allowed
 * (the user may cancel it, which is the end of it), otherwise the store page.
 * Any other outcome of the immediate flow falls back to the store page too.
 */
export async function openUpdate(state: UpdateState): Promise<void> {
  const { AppUpdate } = await sdkModule();
  const platform = Capacitor.getPlatform();
  if (platform === "android" && state.immediate) {
    try {
      const result = await AppUpdate.performImmediateUpdate();
      if (result.code === RESULT_OK || result.code === RESULT_CANCELED) return;
    } catch {
      /* fall through to the store page */
    }
  }
  await AppUpdate.openAppStore(platform === "ios" ? { appId: IOS_APP_ID } : {});
}

/** Test hook. */
export function resetAppUpdateForTests(): void {
  sdk = null;
}
