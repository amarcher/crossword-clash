/**
 * Synced per-puzzle progress for every account (Plus only until 2026-11-16,
 * docs/monetization-spec.md §2.4): the local store (soloProgress.ts) is
 * mirrored to the `solo_progress` table so another device picks a puzzle up
 * where it was.
 *
 * - `startProgressSync(userId)` subscribes to the store's change
 *   notifications: a record is pushed (upsert) 2 s after its last change, or
 *   at once when the page hides; a deleted record (finish, reset) deletes
 *   its row. `stopProgressSync()` flushes and unsubscribes (sign-out, lapse).
 * - `pullProgress(userId)` reads the account's rows and merges them into the
 *   local store, newer `updatedAt` wins (`mergeRemoteProgress`), and returns
 *   the keys that changed. Called when an account appears and when the
 *   tab comes back.
 * - `uploadLocalProgress(userId)` sends what the device already holds, once
 *   per account per device: puzzles started before signing in, or before
 *   every account synced. After the pull, so the local store is the newer.
 *
 * RLS decides who may write: a real account. A refused
 * write is logged and dropped; the local record is untouched, so nothing is
 * lost on the device. Pure parts (row ↔ record) are exported for tests.
 */
import { supabase } from "./supabaseClient";
import { getProgress, loadProgressStore, mergeRemoteProgress, subscribeProgressChanges, type SoloProgressRecord } from "./soloProgress";
import type { CellState } from "../types/puzzle";

export const PUSH_DEBOUNCE_MS = 2000;

export interface SoloProgressRow {
  user_id: string;
  puzzle_key: string;
  cells: Record<string, CellState>;
  elapsed_ms: number;
  filled: number;
  total: number;
  /** ISO timestamp. */
  updated_at: string;
}

export function rowFromRecord(userId: string, r: SoloProgressRecord): SoloProgressRow {
  return {
    user_id: userId,
    puzzle_key: r.key,
    cells: r.cells,
    elapsed_ms: Math.max(0, Math.floor(r.elapsedMs)),
    filled: r.filled,
    total: r.total,
    updated_at: new Date(r.updatedAt).toISOString(),
  };
}

export function recordFromRow(row: Pick<SoloProgressRow, "puzzle_key" | "cells" | "elapsed_ms" | "filled" | "total" | "updated_at">): SoloProgressRecord | null {
  const updatedAt = Date.parse(row.updated_at);
  if (!row.puzzle_key || !row.cells || typeof row.cells !== "object" || !Number.isFinite(updatedAt)) return null;
  return { key: row.puzzle_key, cells: row.cells, elapsedMs: row.elapsed_ms, updatedAt, filled: row.filled, total: row.total };
}

const COLUMNS = "puzzle_key, cells, elapsed_ms, filled, total, updated_at";

let syncUser: string | null = null;
let unsubscribe: (() => void) | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let hideHandler: (() => void) | null = null;

async function pushKey(userId: string, key: string): Promise<void> {
  if (!supabase) return;
  const record = getProgress(key);
  try {
    if (record) {
      const { error } = await supabase.from("solo_progress").upsert(rowFromRecord(userId, record), { onConflict: "user_id,puzzle_key" });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("solo_progress").delete().eq("user_id", userId).eq("puzzle_key", key);
      if (error) throw error;
    }
  } catch (err) {
    console.warn("Progress sync: write refused or failed", err);
  }
}

function schedule(userId: string, key: string, delay: number): void {
  const pending = timers.get(key);
  if (pending) clearTimeout(pending);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void pushKey(userId, key);
    }, delay),
  );
}

/** Push every pending change now (the page is hiding or the sync is stopping). */
export function flushProgressSync(): void {
  const userId = syncUser;
  if (!userId) return;
  for (const [key, timer] of timers) {
    clearTimeout(timer);
    timers.delete(key);
    void pushKey(userId, key);
  }
}

/** Start mirroring the local store for this account. Idempotent per user. */
export function startProgressSync(userId: string): void {
  if (!supabase) return;
  if (syncUser === userId) return;
  stopProgressSync();
  syncUser = userId;
  unsubscribe = subscribeProgressChanges((key, record) => {
    // A deletion goes at once (a finished puzzle must not reappear elsewhere); letters wait for a pause.
    schedule(userId, key, record ? PUSH_DEBOUNCE_MS : 0);
  });
  if (typeof document !== "undefined") {
    hideHandler = () => {
      if (document.visibilityState === "hidden") flushProgressSync();
    };
    document.addEventListener("visibilitychange", hideHandler);
  }
}

export function stopProgressSync(): void {
  flushProgressSync();
  unsubscribe?.();
  unsubscribe = null;
  if (hideHandler && typeof document !== "undefined") document.removeEventListener("visibilitychange", hideHandler);
  hideHandler = null;
  syncUser = null;
}

/** Whether the store is currently being mirrored, and for whom (tests, the account sheet). */
export function progressSyncUser(): string | null {
  return syncUser;
}

/**
 * Read the account's rows and fold them into the local store (newer wins).
 * Returns the keys whose local record changed, so a screen showing one of
 * them can refresh. Never throws: offline is a no-op.
 */
export async function pullProgress(userId: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("solo_progress").select(COLUMNS).eq("user_id", userId);
    if (error) throw error;
    const records = ((data ?? []) as SoloProgressRow[]).map(recordFromRow).filter((r): r is SoloProgressRecord => r !== null);
    return mergeRemoteProgress(records);
  } catch (err) {
    console.warn("Progress sync: could not read", err);
    return [];
  }
}

/** Accounts whose puzzles in progress this device has sent once (deviceData.ts forgets one when a guest's work is folded in). */
export const PROGRESS_UPLOADED_KEY = "crossword-clash:progress-uploaded";

function uploadedIds(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(PROGRESS_UPLOADED_KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Send every puzzle in progress on this device to the account, once per
 * account per device. A change after that goes through the subscription; a
 * failed send is not marked done and is tried again the next time.
 */
export async function uploadLocalProgress(userId: string): Promise<void> {
  if (!supabase || uploadedIds().includes(userId)) return;
  const rows = Object.values(loadProgressStore())
    .filter((r) => Object.keys(r.cells).length > 0)
    .map((r) => rowFromRecord(userId, r));
  try {
    if (rows.length > 0) {
      const { error } = await supabase.from("solo_progress").upsert(rows, { onConflict: "user_id,puzzle_key" });
      if (error) throw error;
    }
    localStorage.setItem(PROGRESS_UPLOADED_KEY, JSON.stringify([...uploadedIds(), userId]));
  } catch (err) {
    console.warn("Progress sync: could not send this device's puzzles", err);
  }
}

/** Test hook. */
export function resetProgressSyncForTests(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  unsubscribe?.();
  unsubscribe = null;
  hideHandler = null;
  syncUser = null;
}
