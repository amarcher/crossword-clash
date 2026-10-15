/**
 * "My puzzles" for the studio: every puzzle the constructor has worked on in
 * this browser, newest first. Each entry holds the full studio state, so
 * opening one restores grid, clues, approvals and versions. localStorage for
 * now; a shared store comes with the community features.
 */
import type { StudioState } from "./studioState";

export const LIBRARY_KEY = "crossword-clash:studio-puzzles";
export const LIBRARY_LIMIT = 50;

export interface LibraryEntry {
  id: string;
  title: string;
  updatedAt: number;
  width: number;
  height: number;
  /** Share of white squares that hold a letter, 0–1. */
  filled: number;
  state: StudioState;
}

/** Nothing worth keeping yet: no letters, blocks, title or clues. */
export function isBlank(state: StudioState): boolean {
  return (
    state.grid.cells.every((c) => c === "") &&
    !state.title.trim() &&
    !Object.values(state.clues).some((c) => c.trim())
  );
}

export function toEntry(state: StudioState, at: number): LibraryEntry {
  const white = state.grid.cells.filter((c) => c !== "#");
  return {
    id: state.id,
    title: state.title.trim(),
    updatedAt: at,
    width: state.grid.width,
    height: state.grid.height,
    filled: white.length ? white.filter((c) => c !== "").length / white.length : 0,
    state,
  };
}

/** Insert or replace by id, newest first, capped. */
export function upsertEntry(list: LibraryEntry[], entry: LibraryEntry): LibraryEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LIBRARY_LIMIT);
}

export function removeEntry(list: LibraryEntry[], id: string): LibraryEntry[] {
  return list.filter((e) => e.id !== id);
}

/** A copy under a new id, so it can be reworked without touching the original. */
export function duplicateState(state: StudioState, id: string): StudioState {
  return { ...state, id, title: state.title.trim() ? `${state.title.trim()} (copy)` : "" };
}

export function loadLibrary(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const list = raw ? (JSON.parse(raw) as LibraryEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e?.id && e.state?.grid?.cells) : [];
  } catch {
    return [];
  }
}

/** False when storage is unavailable or full. */
export function saveLibrary(list: LibraryEntry[]): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
