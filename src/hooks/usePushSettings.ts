import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMaybeAccount } from "../contexts/AccountContext";
import { checkPushPermission, enablePush, fetchPushPrefs, pushAvailable, registerPushToken, savePushPrefs, type PushPermission, type PushPrefs } from "../lib/push";
import { DEFAULT_PUSH_PREFS } from "../lib/pushRules";
import { track } from "../lib/analytics";

export interface PushSettings {
  /** The apps only, with the switch on. False elsewhere, so callers render nothing. */
  available: boolean;
  /** False until the row and the permission are known. */
  ready: boolean;
  prefs: PushPrefs;
  permission: PushPermission;
  /** Busy with a save or the OS prompt. */
  saving: boolean;
  /**
   * Change one or more switches. Turning anything on when the OS has not
   * been asked yet shows the prompt first (in context, never on launch); a
   * denial leaves the switch off and `permission` says why.
   */
  update: (patch: Partial<PushPrefs>, placement: string) => Promise<void>;
}

const KINDS: (keyof PushPrefs)[] = ["daily_reminder", "room_invites", "friend_requests"];

/** The player's notification switches for the session user (anonymous included). */
export function usePushSettings(): PushSettings {
  const { i18n } = useTranslation();
  // Tolerates trees without the provider (the completion modal's tests): nothing is available there.
  const sessionUserId = useMaybeAccount()?.sessionUserId ?? null;
  const available = pushAvailable();
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PUSH_PREFS);
  const [permission, setPermission] = useState<PushPermission>("prompt");
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!available || !sessionUserId) return;
    let live = true;
    Promise.all([fetchPushPrefs(sessionUserId), checkPushPermission()]).then(([row, perm]) => {
      if (!live) return;
      setPrefs(row ?? DEFAULT_PUSH_PREFS);
      setPermission(perm);
      setReadyFor(sessionUserId);
    });
    return () => {
      live = false;
    };
  }, [available, sessionUserId]);

  const update = useCallback(
    async (patch: Partial<PushPrefs>, placement: string) => {
      if (!available || !sessionUserId) return;
      setSaving(true);
      try {
        const turningOn = KINDS.some((k) => patch[k] === true && !prefs[k]);
        let perm = permission;
        if (turningOn && perm !== "granted") {
          track("push_permission_prompted", { placement });
          perm = await enablePush(sessionUserId, { locale: i18n.language });
          setPermission(perm);
          track("push_permission_result", { placement, granted: perm === "granted" });
          if (perm !== "granted") return;
        } else if (turningOn) {
          // Already allowed: make sure this device's token is current.
          void registerPushToken(sessionUserId, { locale: i18n.language });
        }
        const next = await savePushPrefs(sessionUserId, { ...prefs, ...patch });
        setPrefs(next);
        if (patch.daily_reminder !== undefined) track("reminder_toggled", { on: patch.daily_reminder, hour: next.daily_reminder_hour, placement });
      } catch (err) {
        console.warn("Push settings:", err);
      } finally {
        setSaving(false);
      }
    },
    [available, sessionUserId, prefs, permission, i18n.language],
  );

  return { available, ready: !available || readyFor === sessionUserId, prefs, permission, saving, update };
}
