// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A tiny PostgREST-shaped fake: records every call and answers what the test queued.
type Result = { data: unknown; error: { message: string } | null };
const calls: { method: string; args: unknown[] }[] = [];
let nextResult: Result = { data: [], error: null };
function chain(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  for (const method of ["select", "eq", "upsert", "delete"]) {
    self[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return self;
    };
  }
  self.then = (resolve: (r: Result) => unknown) => Promise.resolve(nextResult).then(resolve);
  return self;
}
vi.mock("./supabaseClient", () => ({ supabase: { from: (table: string) => (calls.push({ method: "from", args: [table] }), chain()) } }));

import { clearProgress, loadProgressStore, recordProgressCells, recordProgressElapsed, type SoloProgressRecord } from "./soloProgress";
import {
  flushProgressSync,
  progressSyncUser,
  pullProgress,
  PUSH_DEBOUNCE_MS,
  recordFromRow,
  resetProgressSyncForTests,
  rowFromRecord,
  startProgressSync,
  stopProgressSync,
} from "./soloProgressSync";

const UID = "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const cells = { "0,0": { letter: "C", correct: true }, "0,2": { letter: "T", correct: false } };
const upserts = () => calls.filter((c) => c.method === "upsert").map((c) => c.args[0] as Record<string, unknown>);
const deletes = () => calls.filter((c) => c.method === "delete").length;

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  nextResult = { data: [], error: null };
  resetProgressSyncForTests();
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
});
afterEach(() => {
  resetProgressSyncForTests();
  vi.useRealTimers();
});

describe("row ↔ record", () => {
  const record: SoloProgressRecord = { key: "k", cells, elapsedMs: 1234.7, updatedAt: 1_700_000_000_000, filled: 2, total: 9 };

  it("round-trips, with the clock floored and the time as ISO", () => {
    const row = rowFromRecord(UID, record);
    expect(row).toEqual({ user_id: UID, puzzle_key: "k", cells, elapsed_ms: 1234, filled: 2, total: 9, updated_at: "2023-11-14T22:13:20.000Z" });
    expect(recordFromRow(row)).toEqual({ ...record, elapsedMs: 1234 });
  });

  it("refuses rows with no key, no cells or a junk time", () => {
    const row = rowFromRecord(UID, record);
    expect(recordFromRow({ ...row, puzzle_key: "" })).toBeNull();
    expect(recordFromRow({ ...row, cells: null as unknown as typeof cells })).toBeNull();
    expect(recordFromRow({ ...row, updated_at: "yesterday" })).toBeNull();
  });
});

describe("pushing", () => {
  it("upserts a changed record 2 s after its last change, once, with the user's id", async () => {
    startProgressSync(UID);
    expect(progressSyncUser()).toBe(UID);
    recordProgressCells("k", cells, 9);
    recordProgressElapsed("k", 5000);
    expect(upserts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    expect(upserts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(upserts()).toHaveLength(1);
    expect(upserts()[0]).toMatchObject({ user_id: UID, puzzle_key: "k", elapsed_ms: 5000, filled: 2, total: 9 });
    expect(calls.find((c) => c.method === "upsert")?.args[1]).toEqual({ onConflict: "user_id,puzzle_key" });
  });

  it("deletes the row at once when the local record goes (finish, reset)", async () => {
    startProgressSync(UID);
    recordProgressCells("k", cells, 9);
    clearProgress("k");
    await vi.advanceTimersByTimeAsync(0);
    expect(deletes()).toBe(1);
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([
      ["user_id", UID],
      ["puzzle_key", "k"],
    ]);
    // The pending upsert for the same key was superseded by the delete.
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(upserts()).toHaveLength(0);
  });

  it("flushes pending pushes when the page hides and when the sync stops", async () => {
    startProgressSync(UID);
    recordProgressCells("k", cells, 9);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(upserts()).toHaveLength(1);

    recordProgressCells("k2", cells, 9);
    stopProgressSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(upserts()).toHaveLength(2);
    expect(progressSyncUser()).toBeNull();
    // Unsubscribed: later writes go nowhere.
    recordProgressCells("k3", cells, 9);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(upserts()).toHaveLength(2);
    void flushProgressSync();
  });

  it("logs and keeps the local record when a write is refused (RLS: Plus lapsed)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    nextResult = { data: null, error: { message: "new row violates row-level security policy" } };
    startProgressSync(UID);
    recordProgressCells("k", cells, 9);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(warn).toHaveBeenCalled();
    expect(loadProgressStore().k).toBeTruthy();
    warn.mockRestore();
  });
});

describe("pulling", () => {
  it("merges the account's rows into the local store, newer wins, and reports what changed", async () => {
    recordProgressCells("k", cells, 9, 1_700_000_000_000); // local, newer than the server's copy
    nextResult = {
      data: [
        rowFromRecord(UID, { key: "k", cells, elapsedMs: 1, updatedAt: 1_600_000_000_000, filled: 2, total: 9 }),
        rowFromRecord(UID, { key: "other", cells, elapsedMs: 42, updatedAt: 1_650_000_000_000, filled: 2, total: 9 }),
        { puzzle_key: "junk", cells: null, elapsed_ms: 0, filled: 0, total: 0, updated_at: "nope" },
      ],
      error: null,
    };
    expect(await pullProgress(UID)).toEqual(["other"]);
    const store = loadProgressStore();
    expect(store.k.updatedAt).toBe(1_700_000_000_000);
    expect(store.other.elapsedMs).toBe(42);
    expect(calls[0]).toEqual({ method: "from", args: ["solo_progress"] });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["user_id", UID]);
  });

  it("is a no-op offline or when refused", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    nextResult = { data: null, error: { message: "offline" } };
    expect(await pullProgress(UID)).toEqual([]);
    warn.mockRestore();
  });
});
