// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  HARDWARE_KEYBOARD_KEY,
  hardwareKeyboardInUse,
  isPhysicalGridKey,
  resetInputModalityForTests,
  setHardwareKeyboard,
  useHardwareKeyboard,
} from "./inputModality";

const key = (init: Partial<KeyboardEvent> & { target?: EventTarget | null }) =>
  ({ key: "a", isComposing: false, metaKey: false, ctrlKey: false, altKey: false, target: document.body, ...init }) as KeyboardEvent;

beforeEach(() => {
  localStorage.clear();
  resetInputModalityForTests();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("isPhysicalGridKey", () => {
  it("takes letters and Backspace", () => {
    for (const k of ["a", "Z", "Backspace"]) {
      expect(isPhysicalGridKey(key({ key: k }))).toBe(true);
    }
  });

  it("leaves arrows and Tab alone, since D-pads, pedals and Switch Control send them too", () => {
    for (const k of ["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(isPhysicalGridKey(key({ key: k }))).toBe(false);
    }
  });

  it("skips shortcuts, IME and soft-keyboard keys, and anything typed into a text field", () => {
    expect(isPhysicalGridKey(key({ metaKey: true }))).toBe(false);
    expect(isPhysicalGridKey(key({ ctrlKey: true }))).toBe(false);
    expect(isPhysicalGridKey(key({ isComposing: true }))).toBe(false);
    expect(isPhysicalGridKey(key({ key: "Unidentified" }))).toBe(false);
    expect(isPhysicalGridKey(key({ key: "Shift" }))).toBe(false);
    const input = document.createElement("input");
    expect(isPhysicalGridKey(key({ target: input }))).toBe(false);
  });
});

describe("useHardwareKeyboard", () => {
  it("switches on at the first physical key press and is remembered on the device", () => {
    const { result, unmount } = renderHook(() => useHardwareKeyboard());
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    });
    expect(result.current).toBe(true);
    expect(localStorage.getItem(HARDWARE_KEYBOARD_KEY)).toBe("1");
    unmount();
    resetInputModalityForTests();
    expect(hardwareKeyboardInUse()).toBe(true);
  });

  it("ignores key presses into a text field", () => {
    const { result } = renderHook(() => useHardwareKeyboard());
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "q", bubbles: true }));
    });
    expect(result.current).toBe(false);
    input.remove();
  });

  it("goes back to the on-screen keyboard on request and forgets the choice", () => {
    setHardwareKeyboard(true);
    const { result } = renderHook(() => useHardwareKeyboard());
    expect(result.current).toBe(true);
    act(() => setHardwareKeyboard(false));
    expect(result.current).toBe(false);
    expect(localStorage.getItem(HARDWARE_KEYBOARD_KEY)).toBeNull();
  });

  it("stops listening once nothing uses it", () => {
    const { unmount } = renderHook(() => useHardwareKeyboard());
    unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    expect(hardwareKeyboardInUse()).toBe(false);
  });
});
