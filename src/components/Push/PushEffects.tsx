import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { checkPushPermission, pushAvailable, PUSH_TOKEN_KEY, registerPushToken, startPushTaps } from "../../lib/push";
import { track } from "../../lib/analytics";

/**
 * The apps' push plumbing that runs without a screen: a device that was
 * allowed notifications re-registers on every launch (tokens rotate, and the
 * row's `last_seen_at` is what the sweep reads), and a tap on a notification
 * lands where its link says, through the same mapping as a universal link.
 * Never asks for permission: only the switches do that.
 */
export function PushEffects() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const sessionUserId = useMaybeAccount()?.sessionUserId ?? null;

  useEffect(() => {
    if (!pushAvailable() || !sessionUserId) return;
    let stored: string | null;
    try {
      stored = localStorage.getItem(PUSH_TOKEN_KEY);
    } catch {
      stored = null;
    }
    if (!stored) return;
    void checkPushPermission().then((perm) => {
      if (perm === "granted") void registerPushToken(sessionUserId, { locale: i18n.language });
    });
  }, [sessionUserId, i18n.language]);

  useEffect(
    () =>
      startPushTaps((target) => {
        track("push_opened");
        if (target.kind === "hash") window.location.hash = target.hash;
        else navigate(target.to);
      }),
    [navigate],
  );

  return null;
}
