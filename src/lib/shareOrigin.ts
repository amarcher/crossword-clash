import { Capacitor } from "@capacitor/core";

/** Native WebView origins are local to a device, never shareable room URLs. */
export function shareOrigin(): string {
  return Capacitor.isNativePlatform() ? "https://crosswordclash.com" : window.location.origin;
}
