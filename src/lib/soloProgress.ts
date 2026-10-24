/**
 * Per-puzzle solo progress: the letters and clock of every solo puzzle the
 * player has started and not finished, so any of them can be resumed where
 * it was and the archive can mark them "in progress" — not only the one
 * game the home route resumes (`crossword-clash-solo`, which stays as that
 * pointer). Plus accounts mirror these records to the `solo_progress` table
 * through soloProgressSync.ts, which listens to the change notifications
 * below; this store stays the source of truth on the device.
 *
 * One localStorage key holds a map of records keyed by `puzzleIdentity()`.
 * It is BOUNDED: at most MAX_PROGRESS_RECORDS, the oldest (`updatedAt`)
 * evicted first; a record only exists once a letter has been typed; it is
 * deleted the moment the puzzle is finished or reset. Cells are stored
 * without empty entries, so a 15×15 is at most 225 small objects.
 *
 * Local-only, for anonymous players and accounts alike: the `solves` table
 * stores finishes, not grids, and its conflict rule means nothing for a
 * half-filled puzzle, so syncing progress would be its own table and sync
 * story (docs/puzzle-archive-spec.md §5.3). Everything that decides a value
 * is pure and unit-tested; the localStorage wrapper is fenced off at the
 * bottom, like soloStats.ts.
 */
import type { CellState, Puzzle } from "../types/puzzle";

export interface SoloProgressRecord {
  /** `puzzleIdentity()` of the puzzle. */
  key: string;
  /** The player's cells with a letter, "row,col" → state. */
  cells: Record<string, CellState>;
  /** The clock's accumulated milliseconds, as the timer last checkpointed. */
  elapsedMs: number;
  /** Last write, ms epoch — eviction order and the "newest in progress" pick. */
  updatedAt: number;
  /** Cells with a letter, for a "12 of 25" hint. */
  filled: number;
  /** White cells in the grid. */
  total: number;
}

export type SoloProgressStore = Record<string, SoloProgressRecord>;

export const MAX_PROGRESS_RECORDS = 30;
export const PROGRESS_KEY = "crossword-clash:solo-progress";

// --- Pure ---

/** The cells worth keeping: those with a letter. */
export function filledCells(cells: Readonly<Record<string, CellState>>): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const [pos, cell] of Object.entries(cells)) if (cell && typeof cell.letter === "string" && cell.letter !== "") out[pos] = cell;
  return out;
}

export function whiteCellCount(puzzle: Pick<Puzzle, "cells">): number {
  let n = 0;
  for (const row of puzzle.cells) for (const cell of row) if (cell.solution !== null) n++;
  return n;
}

/** Drop the oldest records until at most `max` remain. */
export function evictOldest(store: SoloProgressStore, max: number = MAX_PROGRESS_RECORDS): SoloProgressStore {
  const keys = Object.keys(store);
  if (keys.length <= max) return store;
  const keep = keys.sort((a, b) => store[b].updatedAt - store[a].updatedAt).slice(0, Math.max(0, max));
  const out: SoloProgressStore = {};
  for (const k of keep) out[k] = store[k];
  return out;
}

/**
 * Record the current letters of a puzzle. A grid with no letter yet creates
 * nothing and leaves an existing record alone (a reload hydrates cells a
 * tick after it loads the puzzle, and must not wipe them in between). The
 * clock is kept from the existing record; `withElapsed` updates it.
 */
export function withCells(
  store: SoloProgressStore,
  key: string,
  cells: Readonly<Record<string, CellState>>,
  total: number,
  now: number = Date.now(),
): SoloProgressStore {
  const kept = filledCells(cells);
  const filled = Object.keys(kept).length;
  if (filled === 0) return store;
  const prev = store[key];
  const record: SoloProgressRecord = { key, cells: kept, elapsedMs: prev?.elapsedMs ?? 0, updatedAt: now, filled, total };
  return evictOldest({ ...store, [key]: record });
}

/** Checkpoint the clock of a puzzle that already has a record; a no-op otherwise. */
export function withElapsed(store: SoloProgressStore, key: string, elapsedMs: number, now: number = Date.now()): SoloProgressStore {
  const prev = store[key];
  if (!prev) return store;
  const ms = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs)) : prev.elapsedMs;
  if (ms === prev.elapsedMs) return store;
  return { ...store, [key]: { ...prev, elapsedMs: ms, updatedAt: now } };
}

export function withoutProgress(store: SoloProgressStore, key: string): SoloProgressStore {
  if (!(key in store)) return store;
  const { [key]: _gone, ...rest } = store;
  return rest;
}

/** The puzzles in progress. */
export function inProgressKeys(store: SoloProgressStore): Set<string> {
  return new Set(Object.keys(store));
}

/** The most recently touched record, or null. */
export function newestProgress(store: SoloProgressStore): SoloProgressRecord | null {
  let best: SoloProgressRecord | null = null;
  for (const r of Object.values(store)) if (!best || r.updatedAt > best.updatedAt) best = r;
  return best;
}

function isRecord(value: unknown): value is SoloProgressRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.key === "string" &&
    typeof r.cells === "object" &&
    r.cells !== null &&
    typeof r.elapsedMs === "number" &&
    typeof r.updatedAt === "number" &&
    typeof r.filled === "number" &&
    typeof r.total === "number"
  );
}

/** Keep only well-formed records whose map key matches their own; cap the size. */
export function sanitizeStore(raw: unknown): SoloProgressStore {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: SoloProgressStore = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isRecord(value) && value.key === key) out[key] = value;
  }
  return evictOldest(out);
}

/**
 * Newer wins, per puzzle: a remote record replaces the local one only when its
 * `updatedAt` is later; an unknown puzzle is added; the cap still applies.
 */
export function mergeProgress(store: SoloProgressStore, remote: readonly SoloProgressRecord[]): { next: SoloProgressStore; changed: string[] } {
  const changed: string[] = [];
  let next = store;
  for (const r of remote) {
    if (!isRecord(r) || Object.keys(r.cells).length === 0) continue;
    const local = store[r.key];
    if (local && local.updatedAt >= r.updatedAt) continue;
    if (next === store) next = { ...store };
    next[r.key] = r;
    changed.push(r.key);
  }
  return { next: changed.length ? evictOldest(next) : store, changed };
}

// --- Change notifications (the Plus sync in soloProgressSync.ts listens) ---

export type ProgressListener = (key: string, record: SoloProgressRecord | null) => void;
const progressListeners = new Set<ProgressListener>();

/** Called after every write below with the record as it now is, or null when it was deleted. */
export function subscribeProgressChanges(listener: ProgressListener): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitProgress(key: string, record: SoloProgressRecord | null): void {
  for (const l of progressListeners) l(key, record);
}

// --- Impure: localStorage (degrades gracefully) ---

export function loadProgressStore(): SoloProgressStore {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? sanitizeStore(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveProgressStore(store: SoloProgressStore): void {
  try {
    if (Object.keys(store).length === 0) localStorage.removeItem(PROGRESS_KEY);
    else localStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable / quota — progress is best-effort, never fatal.
  }
}

export function getProgress(key: string): SoloProgressRecord | null {
  return loadProgressStore()[key] ?? null;
}

export function recordProgressCells(key: string, cells: Readonly<Record<string, CellState>>, total: number, now: number = Date.now()): void {
  const store = loadProgressStore();
  const next = withCells(store, key, cells, total, now);
  if (next !== store) {
    saveProgressStore(next);
    emitProgress(key, next[key] ?? null);
  }
}

export function recordProgressElapsed(key: string, elapsedMs: number, now: number = Date.now()): void {
  const store = loadProgressStore();
  const next = withElapsed(store, key, elapsedMs, now);
  if (next !== store) {
    saveProgressStore(next);
    emitProgress(key, next[key] ?? null);
  }
}

export function clearProgress(key: string): void {
  const store = loadProgressStore();
  const next = withoutProgress(store, key);
  if (next !== store) {
    saveProgressStore(next);
    emitProgress(key, null);
  }
}

/**
 * Merge records that arrived from elsewhere (the Plus sync) into the local
 * store without notifying listeners (they came from the server; echoing them
 * back would loop). Returns the keys whose local record changed.
 */
export function mergeRemoteProgress(remote: readonly SoloProgressRecord[]): string[] {
  const store = loadProgressStore();
  const { next, changed } = mergeProgress(store, remote);
  if (changed.length > 0) saveProgressStore(next);
  return changed;
}
