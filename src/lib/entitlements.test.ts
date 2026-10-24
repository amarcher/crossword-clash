// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A tiny PostgREST-shaped fake for `from("entitlements").select(...).eq(...)`.
type Result = { data: unknown; error: { message: string } | null };
const calls: { method: string; args: unknown[] }[] = [];
let nextResult: () => Promise<Result> = () => Promise.resolve({ data: [], error: null });

function chain(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    self[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return self;
    };
  }
  self.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => nextResult().then(resolve, reject);
  return self;
}

vi.mock("./supabaseClient", () => ({
  supabase: { from: (table: string) => (calls.push({ method: "from", args: [table] }), chain()) },
}));

import {
  CACHE_EXPIRY_GRACE_MS,
  CACHE_KEY,
  CACHE_MAX_AGE_MS,
  clearEntitlements,
  ensureEntitlements,
  getEntitlementState,
  hasPlus,
  parseCache,
  readCache,
  refreshEntitlements,
  resetEntitlementsForTests,
  rowInForce,
  subscribeEntitlements,
  usableCachedRows,
  writeCache,
  type EntitlementRow,
} from "./entitlements";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const DAY = 86_400_000;
const UID = "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";

function row(over: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    user_id: UID,
    product: "plus",
    source: "stripe",
    status: "active",
    expires_at: new Date(NOW + 20 * DAY).toISOString(),
    will_renew: true,
    external_id: "sub_1",
    external_customer: "cus_1",
    updated_at: new Date(NOW).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  nextResult = () => Promise.resolve({ data: [], error: null });
  resetEntitlementsForTests();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("rowInForce / hasPlus", () => {
  it("counts active and grace rows that have not expired, and lifetime rows", () => {
    expect(rowInForce(row(), NOW)).toBe(true);
    expect(rowInForce(row({ status: "grace" }), NOW)).toBe(true);
    expect(rowInForce(row({ expires_at: null }), NOW)).toBe(true);
    expect(rowInForce(row({ expires_at: new Date(NOW - 1).toISOString() }), NOW)).toBe(false);
    expect(rowInForce(row({ status: "expired" }), NOW)).toBe(false);
    expect(rowInForce(row({ status: "revoked", expires_at: null }), NOW)).toBe(false);
    expect(rowInForce(row({ expires_at: "not a date" }), NOW)).toBe(false);
  });

  it("extends a row by the expiry grace when asked", () => {
    const justExpired = row({ expires_at: new Date(NOW - DAY).toISOString() });
    expect(rowInForce(justExpired, NOW)).toBe(false);
    expect(rowInForce(justExpired, NOW, CACHE_EXPIRY_GRACE_MS)).toBe(true);
    expect(rowInForce(row({ expires_at: new Date(NOW - 4 * DAY).toISOString() }), NOW, CACHE_EXPIRY_GRACE_MS)).toBe(false);
  });

  it("hasPlus answers for plus or supporter rows only", () => {
    expect(hasPlus([row()], NOW)).toBe(true);
    expect(hasPlus([row({ product: "supporter", expires_at: null })], NOW)).toBe(true);
    expect(hasPlus([row({ status: "expired" })], NOW)).toBe(false);
    expect(hasPlus([], NOW)).toBe(false);
    expect(hasPlus(null, NOW)).toBe(false);
  });
});

describe("the offline cache", () => {
  it("stands in only for the same user, within 7 days of the fetch, and only with rows inside the 3-day expiry grace", () => {
    const cache = { userId: UID, rows: [row()], fetchedAt: NOW - DAY };
    expect(usableCachedRows(cache, UID, NOW)).toHaveLength(1);
    expect(usableCachedRows(cache, "other", NOW)).toBeNull();
    expect(usableCachedRows(cache, null, NOW)).toBeNull();
    expect(usableCachedRows(null, UID, NOW)).toBeNull();
    expect(usableCachedRows({ ...cache, fetchedAt: NOW - CACHE_MAX_AGE_MS - 1 }, UID, NOW)).toBeNull();
    expect(usableCachedRows({ ...cache, fetchedAt: NOW + DAY }, UID, NOW)).toBeNull();
    // Expired 2 days ago: still counts (a renewal the device has not heard about). 4 days: gone.
    expect(usableCachedRows({ ...cache, rows: [row({ expires_at: new Date(NOW - 2 * DAY).toISOString() })] }, UID, NOW)).toHaveLength(1);
    expect(usableCachedRows({ ...cache, rows: [row({ expires_at: new Date(NOW - 4 * DAY).toISOString() })] }, UID, NOW)).toEqual([]);
    expect(usableCachedRows({ ...cache, rows: [row({ status: "expired" })] }, UID, NOW)).toEqual([]);
  });

  it("round-trips through localStorage and survives junk", () => {
    writeCache({ userId: UID, rows: [row()], fetchedAt: NOW });
    expect(readCache()).toEqual({ userId: UID, rows: [row()], fetchedAt: NOW });
    writeCache(null);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(parseCache("{not json")).toBeNull();
    expect(parseCache(JSON.stringify({ userId: UID }))).toBeNull();
    expect(parseCache(JSON.stringify({ userId: UID, fetchedAt: NOW, rows: [row(), { junk: true }, null] }))?.rows).toEqual([row()]);
  });
});

describe("the store", () => {
  it("answers from the cache at once, then from the server, and writes the fresh answer back", async () => {
    writeCache({ userId: UID, rows: [row({ external_id: "cached" })], fetchedAt: NOW - DAY });
    const fresh = [row({ external_id: "fresh" })];
    nextResult = () => Promise.resolve({ data: fresh, error: null });
    const seen: string[] = [];
    subscribeEntitlements(() => seen.push(getEntitlementState()?.status ?? "none"));

    const done = ensureEntitlements(UID, NOW);
    expect(getEntitlementState()).toEqual({ userId: UID, status: "cached", rows: [row({ external_id: "cached" })] });
    await done;
    expect(getEntitlementState()).toEqual({ userId: UID, status: "ready", rows: fresh });
    expect(seen).toEqual(["cached", "ready"]);
    expect(readCache()).toEqual({ userId: UID, rows: fresh, fetchedAt: NOW });
    expect(calls[0]).toEqual({ method: "from", args: ["entitlements"] });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["user_id", UID]);
  });

  it("drops another user's cache and reports loading until the server answers", async () => {
    writeCache({ userId: "someone-else", rows: [row()], fetchedAt: NOW });
    const done = ensureEntitlements(UID, NOW);
    expect(getEntitlementState()).toEqual({ userId: UID, status: "loading", rows: [] });
    expect(readCache()).toBeNull();
    await done;
    expect(getEntitlementState()?.status).toBe("ready");
  });

  it("keeps the cached rows when the fetch fails, marked as an error", async () => {
    writeCache({ userId: UID, rows: [row()], fetchedAt: NOW - DAY });
    nextResult = () => Promise.resolve({ data: null, error: { message: "offline" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await ensureEntitlements(UID, NOW);
    expect(getEntitlementState()).toEqual({ userId: UID, status: "error", rows: [row()] });
    expect(readCache()?.rows).toEqual([row()]);
    warn.mockRestore();
  });

  it("is a no-op once loaded, shares one in-flight fetch, and refreshes on demand", async () => {
    await ensureEntitlements(UID, NOW);
    const fetches = () => calls.filter((c) => c.method === "from").length;
    expect(fetches()).toBe(1);
    await ensureEntitlements(UID, NOW);
    expect(fetches()).toBe(1);
    const a = refreshEntitlements();
    const b = refreshEntitlements();
    expect(a).toBe(b);
    await a;
    expect(fetches()).toBe(2);
  });

  it("forgets everything on sign-out, cache included", async () => {
    await ensureEntitlements(UID, NOW);
    expect(readCache()).not.toBeNull();
    clearEntitlements();
    expect(getEntitlementState()).toBeNull();
    expect(readCache()).toBeNull();
    await ensureEntitlements(null, NOW);
    expect(getEntitlementState()).toBeNull();
  });

  it("ignores a late answer for a user who has since signed out", async () => {
    let resolve!: (r: Result) => void;
    const deferred = new Promise<Result>((r) => (resolve = r));
    nextResult = () => deferred;
    const done = ensureEntitlements(UID, NOW);
    clearEntitlements();
    resolve({ data: [row()], error: null });
    await done;
    expect(getEntitlementState()).toBeNull();
    expect(readCache()).toBeNull();
  });
});
