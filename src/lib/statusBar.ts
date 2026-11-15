/**
 * The status bar's text on the dark TV stage. The app is light everywhere
 * else, so the OS draws the clock and battery dark, and on the stage's dark
 * canvas they could not be read (Andrew, 2026-11-14: iPad and iPhone).
 * `useLightStatusBar()` turns them light while a stage screen is mounted.
 *
 * Apps only (@capacitor/status-bar), imported dynamically behind the
 * mobile-mode switch like keepAwake.ts, under the same hard rule: no promise
 * here may resolve with the plugin object (a Capacitor plugin is a Proxy that
 * answers `then`), so the promise carries the module namespace and
 * `.StatusBar` is read off it synchronously.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

type StatusBarModule = typeof import("@capacitor/status-bar");

let sdk: Promise<StatusBarModule> | null = null;

function sdkModule(): Promise<StatusBarModule> {
  // The static switch lets Rollup drop the plugin from web builds.
  if (import.meta.env.MODE !== "mobile") return Promise.reject(new Error("The status bar is only styled in the apps."));
  if (!sdk) sdk = import("@capacitor/status-bar");
  return sdk;
}

// Holders: one stage screen handing over to the next (lobby → game) must not flash dark in between.
let holders = 0;

function apply(): void {
  const light = holders > 0;
  sdkModule()
    // Style.Dark is the plugin's name for light text on a dark background.
    .then((m) => (light === holders > 0 ? m.StatusBar.setStyle({ style: light ? m.Style.Dark : m.Style.Light }) : undefined))
    .catch((err) => console.warn("[statusBar] could not style the status bar", err));
}

/** Light status-bar text until the returned function is called. A no-op on the web. */
export function lightStatusBar(): () => void {
  // The static switch drops the native path from web builds (nativeBundle.test.ts).
  if (import.meta.env.MODE !== "mobile" || !Capacitor.isNativePlatform()) return () => {};
  holders += 1;
  if (holders === 1) apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) apply();
  };
}

/** Light status-bar text while the calling screen is mounted (the TV stage). */
export function useLightStatusBar(): void {
  useEffect(() => lightStatusBar(), []);
}
