import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { fetchProfile, isAccount, type Profile } from "../lib/account";
import { ensureEntitlements, refreshEntitlements, useEntitlementStore, type EntitlementRow } from "../lib/entitlements";
import { plusEnabled } from "../lib/plus";

export interface Account {
  /** The signed-in (non-anonymous) user, or null while anonymous. */
  user: User | null;
  /** The account's public profile, or null before a username is chosen (or while loading). */
  profile: Profile | null;
  /** False until the stored session has been read. */
  ready: boolean;
  /** False while the profile for the current user is still being fetched. */
  profileReady: boolean;
  /** Replace the cached profile (after the picker saves one). */
  setProfile: (profile: Profile | null) => void;
  /**
   * Whether the current user (account OR anonymous: an app purchase attaches
   * to the device's anonymous id) has Crossword Clash Plus. Always false
   * while the Plus launch switch (VITE_PLUS) is off, so every gate keeps
   * today's behaviour until launch.
   */
  plus: boolean;
  /** False until the entitlement cache or the first fetch has answered for this user. */
  plusReady: boolean;
  /** The user's entitlement rows (any status), for the account sheet. */
  entitlements: EntitlementRow[];
  /** Refetch entitlements (after a purchase, a restore, a 402 from a metered feature). */
  refreshEntitlements: () => Promise<void>;
}

/**
 * Who is signed in, and their username. Never signs anyone in by itself: the
 * anonymous session comes from useSupabase, and sign-in from the account UI.
 * Also keeps the user's entitlements loaded (for the anonymous user too).
 */
export function useAccount(): Account {
  const [user, setUser] = useState<User | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [profileReady, setProfileReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(isAccount(session?.user) ? session.user : null);
      setSessionUserId(session?.user?.id ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  useEffect(() => {
    setProfileState(null);
    if (!userId) {
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    let live = true;
    fetchProfile(userId)
      .then((p) => live && setProfileState(p))
      .catch(() => live && setProfileState(null))
      .finally(() => live && setProfileReady(true));
    return () => {
      live = false;
    };
  }, [userId]);

  // Entitlements follow the session user (anonymous included) and are
  // re-read when the tab comes back, since a purchase or a renewal may have
  // happened elsewhere meanwhile.
  const enabled = plusEnabled();
  useEffect(() => {
    // Not before the stored session is read: a null user then would clear the
    // cache that is about to answer for the user it belongs to.
    if (!enabled || !ready) return;
    void ensureEntitlements(sessionUserId);
    if (!sessionUserId || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshEntitlements();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, ready, sessionUserId]);

  const entitlement = useEntitlementStore(enabled ? sessionUserId : null);
  const setProfile = useCallback((p: Profile | null) => setProfileState(p), []);
  const refresh = useCallback(() => (enabled ? refreshEntitlements() : Promise.resolve()), [enabled]);

  return {
    user,
    profile,
    ready,
    profileReady,
    setProfile,
    plus: enabled && entitlement.plus,
    plusReady: !enabled || !supabase || (ready && entitlement.ready),
    entitlements: entitlement.rows,
    refreshEntitlements: refresh,
  };
}
