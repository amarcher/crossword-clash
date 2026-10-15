import { useSyncExternalStore } from "react";
import { STUDIO_TOKEN_KEY } from "../lib/seedgrid/studioClaude";

/**
 * The constructor's studio token (gates Claude drafting and the daily queue),
 * kept in this browser and shared by every studio panel that needs it.
 */
let token = read();
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(STUDIO_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStudioToken(value: string) {
  token = value.trim();
  try {
    localStorage.setItem(STUDIO_TOKEN_KEY, token);
  } catch {
    // Kept for this page only.
  }
  listeners.forEach((l) => l());
}

export function useStudioToken(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => token,
    () => token,
  );
}
