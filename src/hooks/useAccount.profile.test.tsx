// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";

type AuthListener = (event: string, session: Session | null) => void;
const authListeners = new Set<AuthListener>();
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthListener) => {
        authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
      },
    },
    from: () => {
      const self: Record<string, unknown> = {};
      self.select = () => self;
      self.eq = () => self;
      self.maybeSingle = () => Promise.resolve({ data: null, error: null });
      self.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return self;
    },
  },
}));
vi.mock("../lib/plus", () => ({ plusEnabled: () => false }));
let release: (() => void) | null = null;
vi.mock("../lib/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/account")>()),
  fetchProfile: (userId: string) =>
    new Promise<{ user_id: string; username: string; display_name: null }>((resolve) => {
      release = () => resolve({ user_id: userId, username: "archer", display_name: null });
    }),
}));

import { useAccount } from "./useAccount";

const session = (id: string, anonymous: boolean) => ({ user: { id, is_anonymous: anonymous, user_metadata: {}, app_metadata: {} } }) as unknown as Session;
const emit = (s: Session | null) => act(() => { for (const l of authListeners) l("SIGNED_IN", s); });

afterEach(() => {
  authListeners.clear();
  release = null;
});

describe("useAccount profile readiness", () => {
  it("is not profileReady for a just-signed-in user until that user's profile has been fetched", async () => {
    const { result } = renderHook(() => useAccount());
    emit(session("anon-1", true));
    // Anonymous: no profile to fetch, ready at once.
    expect(result.current.user).toBeNull();
    expect(result.current.profileReady).toBe(true);

    emit(session("6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c", false));
    // Same render as the new user: the previous "ready, no profile" must not leak through.
    expect(result.current.user?.id).toBe("6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c");
    expect(result.current.profileReady).toBe(false);
    expect(result.current.profile).toBeNull();

    await act(async () => { release?.(); await Promise.resolve(); });
    expect(result.current.profileReady).toBe(true);
    expect(result.current.profile?.username).toBe("archer");
  });
});
