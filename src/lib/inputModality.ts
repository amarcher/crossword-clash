import { useSyncExternalStore } from "react";

/**
 * Whether the player is typing on a physical keyboard (an iPad Magic Keyboard,
 * a Bluetooth keyboard paired with a tablet or foldable, a Chromebook). There
 * is no web signal for "a keyboard is attached", so the first physical key
 * press on the play screen switches the app's own on-screen keyboard off, and
 * the player's "Show keyboard" tap switches it back on. The choice is kept per
 * device, since a docked tablet tends to stay docked.
 *
 * A grid tap deliberately does not bring the keys back: keyboard players tap
 * a square and then type, and the layout would jump on every tap.
 */
export const HARDWARE_KEYBOARD_KEY = "crossword-clash:hardware-keyboard";

const PHYSICAL_KEYS = new Set(["Backspace", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * A key press that came from a physical keyboard aimed at the grid: a letter
 * or a navigation key, with nothing focused that takes text. Presses into a
 * text field are skipped because an OS keyboard types there too, and so are
 * IME/"Unidentified" keys (Android soft keyboards report those).
 */
export function isPhysicalGridKey(e: Pick<KeyboardEvent, "key" | "isComposing" | "metaKey" | "ctrlKey" | "altKey" | "target">): boolean {
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return false;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return false;
  return /^[a-zA-Z]$/.test(e.key) || PHYSICAL_KEYS.has(e.key);
}

function read(): boolean {
  try {
    return localStorage.getItem(HARDWARE_KEYBOARD_KEY) === "1";
  } catch {
    return false;
  }
}

let hardware = read();
const listeners = new Set<() => void>();

export function hardwareKeyboardInUse(): boolean {
  return hardware;
}

export function setHardwareKeyboard(value: boolean): void {
  if (value === hardware) return;
  hardware = value;
  try {
    if (value) localStorage.setItem(HARDWARE_KEYBOARD_KEY, "1");
    else localStorage.removeItem(HARDWARE_KEYBOARD_KEY);
  } catch {
    // Private mode or blocked storage: the choice still holds for this visit.
  }
  listeners.forEach((l) => l());
}

function onKeyDown(e: KeyboardEvent) {
  if (!hardware && isPhysicalGridKey(e)) setHardwareKeyboard(true);
}

function subscribe(listener: () => void) {
  // Capture phase, so the grid's own handler cannot hide the press from us.
  if (listeners.size === 0) window.addEventListener("keydown", onKeyDown, true);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("keydown", onKeyDown, true);
  };
}

/** True once a physical keyboard has been used on the play screen (until "Show keyboard"). */
export function useHardwareKeyboard(): boolean {
  return useSyncExternalStore(subscribe, hardwareKeyboardInUse, () => false);
}

/** Test hook: re-read the stored choice. */
export function resetInputModalityForTests(): void {
  hardware = read();
}
