/**
 * Solo play settings, remembered per device (localStorage
 * `crossword-clash:solo-settings`).
 *
 * One switch so far: **Autocheck**. On — the default, and what every solo
 * time on a leaderboard and every play-insights row before 2026-10-28 was
 * made with — a wrong letter is refused on the spot (the square flashes and
 * nothing is written). Off, letters are written as typed, right or wrong, and
 * judged only when the solver asks (Check word / Check puzzle) or when the
 * grid is full; that is the NYT app's default. Races ignore the setting:
 * correct letters lock in there, so the room always plays with autocheck on.
 *
 * The decisions are pure (`sanitizeSoloSettings`); the storage wrapper and the
 * `useSoloSettings` hook (a useSyncExternalStore over it) are the only impure
 * code. GameContext reads the hook and tells the puzzle reducer
 * (`SET_AUTOCHECK`); the solo play screen owns the toggle.
 */
import { useCallback, useSyncExternalStore } from "react";

export interface SoloSettings {
  /** Refuse wrong letters as they are typed (true), or type freely and check later (false). */
  autocheck: boolean;
}

export const DEFAULT_SOLO_SETTINGS: Readonly<SoloSettings> = Object.freeze({ autocheck: true });

export const SOLO_SETTINGS_KEY = "crossword-clash:solo-settings";

// --- Pure ---

/** Whatever was stored, as valid settings: unknown or malformed fields fall back to the defaults. */
export function sanitizeSoloSettings(raw: unknown): SoloSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    autocheck: typeof obj.autocheck === "boolean" ? obj.autocheck : DEFAULT_SOLO_SETTINGS.autocheck,
  };
}

// --- Impure: localStorage + change notifications ---

const listeners = new Set<() => void>();
/** The last parsed settings, so the store hands React a stable snapshot. */
let snapshot: SoloSettings | null = null;

function read(): SoloSettings {
  try {
    const raw = localStorage.getItem(SOLO_SETTINGS_KEY);
    return sanitizeSoloSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SOLO_SETTINGS };
  }
}

export function loadSoloSettings(): SoloSettings {
  if (!snapshot) snapshot = read();
  return snapshot;
}

function notify() {
  for (const l of listeners) l();
}

export function saveSoloSettings(next: SoloSettings): void {
  const clean = sanitizeSoloSettings(next);
  try {
    localStorage.setItem(SOLO_SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    // Storage unavailable or full: the setting still applies for this page.
  }
  snapshot = clean;
  notify();
}

export function updateSoloSettings(patch: Partial<SoloSettings>): SoloSettings {
  const next = { ...loadSoloSettings(), ...patch };
  saveSoloSettings(next);
  return next;
}

export function subscribeSoloSettings(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing the setting is picked up through the storage event.
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOLO_SETTINGS_KEY || e.key === null) {
      snapshot = null;
      listener();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Test hook: forget the cached snapshot so the next read goes to storage. */
export function resetSoloSettingsForTests(): void {
  snapshot = null;
  listeners.clear();
}

const serverSnapshot = () => DEFAULT_SOLO_SETTINGS as SoloSettings;

/** The device's solo settings, live, plus a setter per switch. */
export function useSoloSettings(): SoloSettings & { setAutocheck: (on: boolean) => void } {
  const settings = useSyncExternalStore(subscribeSoloSettings, loadSoloSettings, serverSnapshot);
  const setAutocheck = useCallback((on: boolean) => {
    updateSoloSettings({ autocheck: on });
  }, []);
  return { ...settings, setAutocheck };
}
