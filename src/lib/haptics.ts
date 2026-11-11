/**
 * A short buzz when a letter is refused (Andrew, 2026-11-11): typing fast,
 * the red flash on the square is easy to miss, and the solver carries on a
 * square behind without knowing a letter was turned away. The buzz is felt
 * without looking.
 *
 * In the apps it is the system's error pattern through `@capacitor/haptics`
 * (the Taptic Engine on an iPhone, the vibrator on Android); the plugin is
 * imported dynamically behind the mobile-mode switch, and only its module
 * namespace ever sits in a promise (a Capacitor plugin object answers `then`,
 * see nativePluginProxy.test.ts). On the web it is `navigator.vibrate`, which
 * Android browsers have and iOS Safari does not, so an iPhone on the website
 * gets nothing.
 *
 * Whether to buzz at all is the device's setting (`soloSettings.ts` →
 * `haptics`, on by default); this module only knows how.
 */
import { Capacitor } from "@capacitor/core";

/** Two short pulses, like the system's "error" pattern, for browsers that vibrate. */
export const WRONG_LETTER_PATTERN: readonly number[] = [35, 45, 35];

type HapticsModule = typeof import("@capacitor/haptics");
let plugin: Promise<HapticsModule> | null = null;

function native(): boolean {
  return import.meta.env.MODE === "mobile" && Capacitor.isNativePlatform();
}

/**
 * Whether this device can buzz, which is when the switch is worth showing:
 * the apps, and a touch device whose browser has the Vibration API. A desktop
 * browser has the API too and no motor, hence the touch check.
 */
export function hapticsAvailable(): boolean {
  if (native()) return true;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  return (navigator.maxTouchPoints ?? 0) > 0;
}

/** The buzz for a refused letter. Never throws; does nothing where nothing can buzz. */
export function wrongLetterHaptic(): void {
  if (native()) {
    plugin ??= import("@capacitor/haptics");
    void plugin.then((m) => m.Haptics.notification({ type: m.NotificationType.Error })).catch(() => {});
    return;
  }
  try {
    if (hapticsAvailable()) navigator.vibrate([...WRONG_LETTER_PATTERN]);
  } catch {
    // A browser may refuse (no user gesture yet, a permissions policy): nothing to do.
  }
}

/** Test hook: forget the loaded plugin. */
export function resetHapticsForTests(): void {
  plugin = null;
}
