import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { checkPushPermission, enablePush, pushAvailable, PUSH_TOKEN_KEY, registerPushToken, startPushTaps } from "../../lib/push";
import { track } from "../../lib/analytics";

/** localStorage: set once the first-open permission ask has happened (or was found unnecessary) on this device. */
export const PUSH_FIRST_ASK_KEY = "crossword-clash:push-first-ask";
/** The menu has painted by then; the OS sheet should not be the first thing on screen. */
export const FIRST_ASK_DELAY_MS = 1500;

function readFirstAsk(): boolean {
  try {
    return localStorage.getItem(PUSH_FIRST_ASK_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberFirstAsk(): void {
  try {
    localStorage.setItem(PUSH_FIRST_ASK_KEY, new Date().toISOString());
  } catch {
    // Private mode: the OS remembers the answer anyway, and only "prompt" asks.
  }
}

/**
 * The apps' push plumbing that runs without a screen: a device that was
 * allowed notifications re-registers on every launch (tokens rotate, and the
 * row's `last_seen_at` is what the sweep reads), and a tap on a notification
 * lands where its link says, through the same mapping as a universal link.
 *
 * It also asks for permission once, on the first open (Andrew, 2026-11-03:
 * nobody found the switches, so invites and friend requests reached no one).
 * The OS sheet comes `FIRST_ASK_DELAY_MS` after the session user exists, only
 * while the OS still says "prompt" (a device that already answered — through a
 * switch, or an earlier build — is never asked again), and the ask is
 * remembered per device. A grant registers the token under the default
 * preferences: room invites and friend requests on, the daily reminder off
 * until its own switch.
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

  // The first-open ask: one per device, never twice in a session either.
  const firstAskStarted = useRef(false);
  useEffect(() => {
    if (!pushAvailable() || !sessionUserId || firstAskStarted.current || readFirstAsk()) return;
    const locale = i18n.language;
    const timer = window.setTimeout(async () => {
      if (firstAskStarted.current) return;
      firstAskStarted.current = true;
      try {
        const perm = await checkPushPermission();
        if (perm !== "prompt") {
          rememberFirstAsk();
          return;
        }
        track("push_permission_prompted", { placement: "first_open" });
        const result = await enablePush(sessionUserId, { locale });
        rememberFirstAsk();
        track("push_permission_result", { placement: "first_open", granted: result === "granted" });
      } catch (err) {
        console.warn("Push first ask:", err);
      }
    }, FIRST_ASK_DELAY_MS);
    return () => window.clearTimeout(timer);
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
