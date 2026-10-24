import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ensureEntitlements, refreshEntitlements, useEntitlementStore, type Entitlement, type EntitlementRow } from "../lib/entitlements";
import { plusEnabled } from "../lib/plus";

export interface PlusStatus {
  /** The session user's id (anonymous included), or null before the session is read / without Supabase. */
  sessionUserId: string | null;
  /** Whether that session user is a real account (not anonymous). */
  isAccount: boolean;
  /** False until the stored session has been read. */
  sessionReady: boolean;
  /** Whether the session user holds Plus. Always false while the VITE_PLUS switch is off. */
  plus: boolean;
  /** False until the entitlement cache or the first fetch has answered for this user. */
  plusReady: boolean;
  entitlements: EntitlementRow[];
  /** The in-force Plus row, for "renews on" / "manage" (its source). */
  current: EntitlementRow | null;
  refreshEntitlements: () => Promise<void>;
}

/**
 * Plus for any screen, inside or outside AccountProvider (the TV view and the
 * studio have their own layouts): follows the SESSION user, anonymous
 * included, because an app purchase attaches to the device's anonymous id,
 * keeps the shared entitlement store loaded and refetches when the tab
 * comes back. `useAccount` builds on this; nothing here signs anyone in.
 */
export function usePlusStatus(): PlusStatus {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [isAccount, setIsAccount] = useState(false);
  const [sessionReady, setSessionReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user?.id ?? null);
      setIsAccount(!!session?.user && !session.user.is_anonymous);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const enabled = plusEnabled();
  useEffect(() => {
    // Not before the stored session is read: a null user then would clear the
    // cache that is about to answer for the user it belongs to.
    if (!enabled || !sessionReady) return;
    void ensureEntitlements(sessionUserId);
    if (!sessionUserId || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshEntitlements();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, sessionReady, sessionUserId]);

  const entitlement: Entitlement = useEntitlementStore(enabled ? sessionUserId : null);
  const refresh = useCallback(() => (enabled ? refreshEntitlements() : Promise.resolve()), [enabled]);

  return {
    sessionUserId,
    isAccount,
    sessionReady,
    plus: enabled && entitlement.plus,
    plusReady: !enabled || !supabase || (sessionReady && entitlement.ready),
    entitlements: entitlement.rows,
    current: entitlement.current,
    refreshEntitlements: refresh,
  };
}
