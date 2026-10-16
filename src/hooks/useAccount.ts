import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { fetchProfile, isAccount, type Profile } from "../lib/account";

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
}

/**
 * Who is signed in, and their username. Never signs anyone in by itself: the
 * anonymous session comes from useSupabase, and sign-in from the account UI.
 */
export function useAccount(): Account {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [profileReady, setProfileReady] = useState(!supabase);

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

  return { user, profile, ready, profileReady, setProfile };
}
