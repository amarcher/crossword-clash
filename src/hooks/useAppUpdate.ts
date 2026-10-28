import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "../lib/analytics";
import {
  appUpdateAvailable,
  checkForUpdate,
  dismissUpdate,
  dismissedUpdateKey,
  openUpdate,
  type UpdateState,
} from "../lib/appUpdate";

export interface AppUpdate {
  /** A newer build is live in the store and the player has not dismissed this version. False until the check answers. */
  available: boolean;
  /** The store's version name when the platform reports one (iOS); undefined on Android. */
  version?: string;
  /** Takes the player to the update (Play's immediate flow, or the store page). */
  update: () => void;
  /** "Later": hides the banner for this version on this device. */
  dismiss: () => void;
}

/**
 * The menu's update banner state. Asks the store once per launch and again
 * on a return to the foreground after an hour (both rules live in
 * lib/appUpdate.ts); on the web it is always "nothing available" and never
 * imports the plugin.
 */
export function useAppUpdate(): AppUpdate {
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => dismissedUpdateKey());
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!appUpdateAvailable()) return;
    let cancelled = false;
    const check = () => {
      void checkForUpdate().then((next) => {
        if (!cancelled && next) setState(next);
      });
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const available = !!state?.available && !!state.key && state.key !== dismissedKey;
  const version = available ? state?.version : undefined;
  const key = available ? state?.key ?? null : null;

  useEffect(() => {
    if (!key || shownFor.current === key) return;
    shownFor.current = key;
    track("app_update_shown", { version: key });
  }, [key]);

  const update = useCallback(() => {
    if (!state?.available) return;
    track("app_update_tapped", { version: state.key });
    void openUpdate(state).catch(() => {
      /* the store could not be opened; the banner stays for the next try */
    });
  }, [state]);

  const dismiss = useCallback(() => {
    if (!state?.key) return;
    track("app_update_dismissed", { version: state.key });
    dismissUpdate(state.key);
    setDismissedKey(state.key);
  }, [state]);

  return { available, version, update, dismiss };
}
