/**
 * Keep the screen on while a shared display is showing (the TV / host view
 * propped up on a tablet, a laptop on the TV). Without it the device dims and
 * locks mid-game, since nobody touches a scoreboard.
 *
 * The apps use @capacitor-community/keep-awake (the web Wake Lock API is not
 * reliably exposed inside an app's WebView); the web uses
 * `navigator.wakeLock`. The browser drops a wake lock whenever the page is
 * hidden, so it is asked for again each time the page becomes visible.
 *
 * The plugin is imported dynamically behind the mobile-mode switch, like
 * appUpdate.ts, under the same hard rule: no promise here may resolve with
 * the plugin object (a Capacitor plugin is a Proxy that answers `then`, so
 * such a promise never settles). The promise carries the module namespace and
 * `.KeepAwake` is read off it synchronously.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

type KeepAwakeModule = typeof import("@capacitor-community/keep-awake");

let sdk: Promise<KeepAwakeModule> | null = null;

function sdkModule(): Promise<KeepAwakeModule> {
  // The static switch lets Rollup drop the plugin from web builds.
  if (import.meta.env.MODE !== "mobile") return Promise.reject(new Error("The native screen lock is only used in the apps."));
  if (!sdk) sdk = import("@capacitor-community/keep-awake");
  return sdk;
}

// Holders of the native lock: one screen handing over to the next (lobby → game)
// must never let the screen sleep in between.
let nativeHolders = 0;

function nativeKeepAwake(): () => void {
  nativeHolders += 1;
  if (nativeHolders === 1) {
    sdkModule()
      .then((m) => (nativeHolders > 0 ? m.KeepAwake.keepAwake() : undefined))
      .catch((err) => console.warn("[keepAwake] could not keep the screen on", err));
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    nativeHolders -= 1;
    if (nativeHolders > 0) return;
    sdkModule()
      .then((m) => (nativeHolders === 0 ? m.KeepAwake.allowSleep() : undefined))
      .catch(() => {});
  };
}

function webKeepAwake(): () => void {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return () => {};
  let sentinel: WakeLockSentinel | null = null;
  // One request at a time: a hide/show while the first is still pending must not
  // send a second one, or the first lock it grants is overwritten and never released.
  let pending = false;
  let released = false;
  const acquire = () => {
    if (released || pending || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
    pending = true;
    navigator.wakeLock
      .request("screen")
      .then((s) => {
        if (released) void s.release();
        else sentinel = s;
      })
      // Refused (battery saver, no user activation yet, policy): the screen may dim, nothing else breaks.
      .catch(() => {})
      .finally(() => {
        pending = false;
        // The page came back while the request was pending and the browser already
        // dropped what it granted: ask once more.
        if (!released && sentinel?.released) acquire();
      });
  };
  const onVisibility = () => acquire();
  document.addEventListener("visibilitychange", onVisibility);
  acquire();
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisibility);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}

/** Keep the screen on until the returned function is called. */
export function keepScreenAwake(): () => void {
  return import.meta.env.MODE === "mobile" && Capacitor.isNativePlatform() ? nativeKeepAwake() : webKeepAwake();
}

/** Keeps the screen on while `active` and the component is mounted. */
export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return keepScreenAwake();
  }, [active]);
}
