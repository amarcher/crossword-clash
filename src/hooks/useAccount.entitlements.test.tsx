// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";

type AuthListener = (event: string, session: Session | null) => void;
let authListener: AuthListener | null = null;
let rows: unknown[] = [];
/** When set, the next entitlements fetch waits on it (to observe the cached answer). */
let hold: Promise<void> | null = null;
const fetches: string[] = [];

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthListener) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => (authListener = null) } } };
      },
    },
    from: (table: string) => {
      fetches.push(table);
      const self: Record<string, unknown> = {};
      self.select = () => self;
      self.eq = () => self;
      self.maybeSingle = () => Promise.resolve({ data: null, error: null });
      self.then = (resolve: (r: unknown) => unknown) => (hold ?? Promise.resolve()).then(() => ({ data: rows, error: null })).then(resolve);
      return self;
    },
  },
}));

const flag = { on: true };
vi.mock("../lib/plus", () => ({ plusEnabled: () => flag.on }));

import { useAccount } from "./useAccount";
import { CACHE_KEY, resetEntitlementsForTests } from "../lib/entitlements";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const UID = "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const plusRow = {
  user_id: UID,
  product: "plus",
  source: "revenuecat",
  status: "active",
  expires_at: new Date(NOW + 10 * 86_400_000).toISOString(),
  will_renew: true,
  external_id: "tx",
  external_customer: UID,
  updated_at: new Date(NOW).toISOString(),
};
const session = (id: string, anonymous: boolean) => ({ user: { id, is_anonymous: anonymous, user_metadata: {}, app_metadata: {} } }) as unknown as Session;

beforeEach(() => {
  localStorage.clear();
  rows = [];
  hold = null;
  fetches.length = 0;
  flag.on = true;
  resetEntitlementsForTests();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAccount: entitlements", () => {
  it("loads the ANONYMOUS session user's entitlements too (an app purchase attaches to it), and reports Plus", async () => {
    rows = [plusRow];
    const { result } = renderHook(() => useAccount());
    expect(result.current.plusReady).toBe(false);
    await act(async () => {
      authListener?.("INITIAL_SESSION", session(UID, true));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.plus).toBe(true);
    expect(result.current.plusReady).toBe(true);
    expect(result.current.entitlements).toEqual([plusRow]);
    expect(fetches).toEqual(["entitlements"]);
  });

  it("answers Plus from the cache before the server does, and clears on sign-out", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: UID, rows: [plusRow], fetchedAt: NOW - 3_600_000 }));
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    rows = [plusRow];
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      authListener?.("INITIAL_SESSION", session(UID, false));
    });
    // The fetch is still held: this answer is the cache's.
    expect(result.current.plus).toBe(true);
    expect(result.current.plusReady).toBe(true);
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(result.current.plus).toBe(true);
    await act(async () => {
      authListener?.("SIGNED_OUT", null);
    });
    expect(result.current.plus).toBe(false);
    expect(result.current.plusReady).toBe(true);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("does nothing while the Plus switch is off: no fetch, never Plus, always ready", async () => {
    flag.on = false;
    rows = [plusRow];
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      authListener?.("INITIAL_SESSION", session(UID, false));
    });
    expect(result.current.plus).toBe(false);
    expect(result.current.plusReady).toBe(true);
    expect(fetches).toEqual(["profiles"]);
    await result.current.refreshEntitlements();
    expect(fetches).toEqual(["profiles"]);
  });

  it("refetches when the tab becomes visible again", async () => {
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      authListener?.("INITIAL_SESSION", session(UID, true));
    });
    expect(fetches.filter((t) => t === "entitlements")).toHaveLength(1);
    rows = [plusRow];
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(fetches.filter((t) => t === "entitlements")).toHaveLength(2);
    expect(result.current.plus).toBe(true);
  });
});
