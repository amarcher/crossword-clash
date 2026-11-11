// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WRONG_LETTER_PATTERN, hapticsAvailable, wrongLetterHaptic } from "./haptics";

/** The web path: the Vibration API, on a touch device only. (The apps: haptics.native.test.ts.) */
const nav = navigator as unknown as { vibrate?: unknown; maxTouchPoints?: number };
const setDevice = (vibrate: unknown, touchPoints: number) => {
  Object.defineProperty(nav, "vibrate", { configurable: true, writable: true, value: vibrate });
  Object.defineProperty(nav, "maxTouchPoints", { configurable: true, value: touchPoints });
};

beforeEach(() => setDevice(undefined, 0));
afterEach(() => setDevice(undefined, 0));

describe("haptics on the web", () => {
  it("is available only where there is a Vibration API and a touch screen", () => {
    expect(hapticsAvailable()).toBe(false); // iOS Safari: no API
    setDevice(vi.fn(), 0);
    expect(hapticsAvailable()).toBe(false); // a desktop browser: the API, no motor
    setDevice(vi.fn(), 5);
    expect(hapticsAvailable()).toBe(true); // an Android phone
  });

  it("buzzes the wrong-letter pattern, and does nothing where nothing can buzz", () => {
    const vibrate = vi.fn(() => true);
    setDevice(vibrate, 5);
    wrongLetterHaptic();
    expect(vibrate).toHaveBeenCalledWith([...WRONG_LETTER_PATTERN]);

    const desktop = vi.fn();
    setDevice(desktop, 0);
    wrongLetterHaptic();
    expect(desktop).not.toHaveBeenCalled();
    setDevice(undefined, 5);
    expect(() => wrongLetterHaptic()).not.toThrow();
  });

  it("swallows a browser's refusal", () => {
    setDevice(() => {
      throw new Error("NotAllowedError");
    }, 5);
    expect(() => wrongLetterHaptic()).not.toThrow();
  });
});
