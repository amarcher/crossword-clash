import { useSyncExternalStore } from "react";
import { loadHiddenAuthors, subscribeHiddenAuthors } from "../lib/hiddenAuthors";

const EMPTY: readonly string[] = [];

/** The author ids hidden on this device (hiddenAuthors.ts), live. */
export function useHiddenAuthors(): readonly string[] {
  return useSyncExternalStore(subscribeHiddenAuthors, loadHiddenAuthors, () => EMPTY);
}
