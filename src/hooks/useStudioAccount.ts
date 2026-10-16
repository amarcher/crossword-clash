import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { fetchIsStudioAdmin, isAccount } from "../lib/studioAuth";

export interface StudioAccount {
  /** The signed-in (non-anonymous) user, or null. */
  user: User | null;
  /** Whether that user is in studio_admins; false while unknown or signed out. */
  admin: boolean;
  /** False until the stored session has been read. */
  ready: boolean;
}

/** The studio's view of who is signed in. Never signs anyone in by itself. */
export function useStudioAccount(): StudioAccount {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(!supabase);

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
    setAdmin(false);
    if (!userId) return;
    let live = true;
    void fetchIsStudioAdmin(userId).then((yes) => live && setAdmin(yes));
    return () => {
      live = false;
    };
  }, [userId]);

  return { user, admin, ready };
}
