/**
 * Entitlements on the client (docs/monetization-spec.md §3.3): what the
 * signed-in or anonymous user is entitled to, read from the `entitlements`
 * table (RLS: own rows only; only the verify-purchase edge function writes),
 * kept in a per-session store every screen can subscribe to, and cached in
 * localStorage so a Plus player who opens the app offline still gets the
 * archive and the studio.
 *
 * Cache rules (the offline grace): a cached `active` / `grace` row counts
 * while its `expires_at` is less than CACHE_EXPIRY_GRACE_MS (3 days) in the
 * past AND the cache was fetched within CACHE_MAX_AGE_MS (7 days); past either
 * the client falls back to free until it can refetch. Anything that costs
 * money is decided on the server (narrator minutes, Claude calls), so the
 * cache can only ever over-grant client-side features for a week.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";
import type { EntitlementProduct, EntitlementSource, EntitlementStatus } from "./purchaseEvents";

export interface EntitlementRow {
  user_id: string;
  product: EntitlementProduct;
  source: EntitlementSource;
  status: EntitlementStatus;
  expires_at: string | null;
  will_renew: boolean;
  external_id: string | null;
  external_customer: string | null;
  updated_at: string;
}

export const CACHE_KEY = "crossword-clash:entitlements";
/** How long past `expires_at` a cached row still counts (a renewal the device has not heard about yet). */
export const CACHE_EXPIRY_GRACE_MS = 3 * 24 * 3_600_000;
/** How old the cache may be and still count at all. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 3_600_000;

/** The products that unlock Plus features (a one-time supporter unlock would join the list). */
export const PLUS_PRODUCTS: readonly EntitlementProduct[] = ["plus", "supporter"];

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/** Whether one row is in force at `now`: active or in the billing grace window, and not past its expiry. */
export function rowInForce(row: Pick<EntitlementRow, "status" | "expires_at">, now: number, expiryGraceMs = 0): boolean {
  if (row.status !== "active" && row.status !== "grace") return false;
  if (row.expires_at === null) return true;
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires + expiryGraceMs > now;
}

/** Whether these rows grant Plus at `now` (the same question `has_entitlement(uid, 'plus')` answers server-side). */
export function hasPlus(rows: readonly Pick<EntitlementRow, "product" | "status" | "expires_at">[] | null | undefined, now: number = Date.now()): boolean {
  return !!rows?.some((r) => PLUS_PRODUCTS.includes(r.product) && rowInForce(r, now));
}

export interface EntitlementCache {
  userId: string;
  rows: EntitlementRow[];
  /** ms epoch of the fetch the rows came from. */
  fetchedAt: number;
}

/**
 * The rows a cache may stand in for while offline: only for the same user,
 * only within CACHE_MAX_AGE_MS, and each row only within the expiry grace.
 * Rows that no longer count are dropped rather than returned as expired, so
 * a caller sees "no Plus" instead of a misleading status.
 */
export function usableCachedRows(cache: EntitlementCache | null, userId: string | null, now: number): EntitlementRow[] | null {
  if (!cache || !userId || cache.userId !== userId) return null;
  if (!Number.isFinite(cache.fetchedAt) || now - cache.fetchedAt > CACHE_MAX_AGE_MS || cache.fetchedAt > now + 60_000) return null;
  return cache.rows.filter((r) => rowInForce(r, now, CACHE_EXPIRY_GRACE_MS));
}

function isRow(value: unknown): value is EntitlementRow {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.user_id === "string" && typeof r.product === "string" && typeof r.status === "string" && (r.expires_at === null || typeof r.expires_at === "string");
}

/** Parses a stored cache, or null for anything malformed. */
export function parseCache(raw: string | null): EntitlementCache | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EntitlementCache>;
    if (typeof parsed.userId !== "string" || typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.rows)) return null;
    return { userId: parsed.userId, fetchedAt: parsed.fetchedAt, rows: parsed.rows.filter(isRow) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

export function readCache(): EntitlementCache | null {
  try {
    return parseCache(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

export function writeCache(cache: EntitlementCache | null): void {
  try {
    if (cache) localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Without storage the next load simply refetches.
  }
}

// ---------------------------------------------------------------------------
// The per-session store (useSyncExternalStore)
// ---------------------------------------------------------------------------

export type EntitlementStatusKind = "cached" | "loading" | "ready" | "error";

export interface EntitlementState {
  userId: string;
  /** cached: the offline cache is standing in; loading: first fetch in flight with nothing cached; ready/error: the fetch settled. */
  status: EntitlementStatusKind;
  rows: EntitlementRow[];
}

let state: EntitlementState | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: EntitlementState | null) {
  state = next;
  emit();
}

export function getEntitlementState(): EntitlementState | null {
  return state;
}

export function subscribeEntitlements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const COLUMNS = "user_id, product, source, status, expires_at, will_renew, external_id, external_customer, updated_at";

async function fetchRows(userId: string): Promise<EntitlementRow[]> {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  const { data, error } = await supabase.from("entitlements").select(COLUMNS).eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as EntitlementRow[];
}

/**
 * Points the store at `userId` (anonymous users included: an app purchase
 * attaches to the device's anonymous id) and loads their rows. The cache
 * answers first when it is usable, so Plus features render on the first
 * frame; a different user than the cache's drops it. Safe to call repeatedly.
 */
export function ensureEntitlements(userId: string | null, now: number = Date.now()): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (!userId) {
    clearEntitlements();
    return Promise.resolve();
  }
  if (state?.userId === userId && (state.status === "ready" || inflight)) return inflight ?? Promise.resolve();
  const cached = usableCachedRows(readCache(), userId, now);
  if (!cached) writeCache(null);
  setState({ userId, status: cached ? "cached" : "loading", rows: cached ?? [] });
  return refreshEntitlements();
}

/** Refetches the current user's rows (after a purchase, a restore, a 402, or on return to the tab). */
export function refreshEntitlements(): Promise<void> {
  const current = state;
  if (!supabase || !current) return Promise.resolve();
  if (inflight) return inflight;
  const run = (async () => {
    try {
      const rows = await fetchRows(current.userId);
      if (state?.userId !== current.userId) return;
      writeCache({ userId: current.userId, rows, fetchedAt: Date.now() });
      setState({ userId: current.userId, status: "ready", rows });
    } catch (err) {
      if (state?.userId !== current.userId) return;
      console.warn("Entitlements: could not load", err);
      // Keep whatever stood in (the cache), but say the fetch failed.
      setState({ ...state, status: "error" });
    }
  })();
  const tracked: Promise<void> = run.finally(() => {
    if (inflight === tracked) inflight = null;
  });
  inflight = tracked;
  return tracked;
}

/** Forget everything (sign-out, user change). The cache goes too. */
export function clearEntitlements(): void {
  inflight = null;
  writeCache(null);
  if (state) setState(null);
}

/** Test hook: forget everything, including subscribers. */
export function resetEntitlementsForTests(): void {
  state = null;
  inflight = null;
  listeners.clear();
}

export interface Entitlement {
  /** Whether the current user has Plus right now (cache or server). */
  plus: boolean;
  /** False until the cache or the first fetch has answered for this user. */
  ready: boolean;
  rows: EntitlementRow[];
  /** The active Plus row, for "Manage subscription" (source) and "renews on". */
  current: EntitlementRow | null;
}

const NONE: Entitlement = { plus: false, ready: false, rows: [], current: null };
const serverSnapshot = () => null;

/** The current user's entitlement, live. `userId` is the session user (anonymous or account); null → not entitled, ready. */
export function useEntitlementStore(userId: string | null): Entitlement {
  const s = useSyncExternalStore(subscribeEntitlements, getEntitlementState, serverSnapshot);
  if (!userId) return { ...NONE, ready: true };
  if (!s || s.userId !== userId) return NONE;
  const now = Date.now();
  const current = s.rows.find((r) => PLUS_PRODUCTS.includes(r.product) && rowInForce(r, now)) ?? null;
  return { plus: !!current, ready: s.status !== "loading", rows: s.rows, current };
}
