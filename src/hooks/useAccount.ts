import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { fetchProfile, isAccount, type Profile } from "../lib/account";
import type { EntitlementRow } from "../lib/entitlements";
import { usePlusStatus } from "./usePlus";

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
  /** The in-force Plus row (source, expiry), or null. */
  plusRow: EntitlementRow | null;
  /** Refetch entitlements (after a purchase, a restore, a 402 from a metered feature). */
  refreshEntitlements: () => Promise<void>;
}

/**
 * Who is signed in, and their username. Never signs anyone in by itself: the
 * anonymous session comes from useSupabase, and sign-in from the account UI.
 * Also keeps the user's entitlements loaded (for the anonymous user too),
 * through usePlusStatus.
 */
export function useAccount(): Account {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [profileReady, setProfileReady] = useState(!supabase);
  const plusStatus = usePlusStatus();

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(isAccount(session?.user) ? session.user : null);
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

  const setProfile = useCallback((p: Profile | null) => setProfileState(p), []);

  return {
    user,
    profile,
    ready,
    profileReady,
    setProfile,
    plus: plusStatus.plus,
    plusReady: plusStatus.plusReady,
    entitlements: plusStatus.entitlements,
    plusRow: plusStatus.current,
    refreshEntitlements: plusStatus.refreshEntitlements,
  };
}
