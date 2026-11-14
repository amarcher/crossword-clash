import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { Bell } from "lucide-react";
import { checkPushPermission, DAILY_FINISH_CLOSED_EVENT, enablePush, fetchPushPrefs, pushAvailable, PUSH_TOKEN_KEY, registerPushToken, savePushPrefs, startPushTaps } from "../../lib/push";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button } from "../ui";
import { track } from "../../lib/analytics";

/** localStorage: set once the first-open ask has been answered (or was found unnecessary) on this device. */
export const PUSH_FIRST_ASK_KEY = "crossword-clash:push-first-ask";
/** localStorage: set once the after-a-daily reminder ask has been shown on this device. */
export const PUSH_REMINDER_ASK_KEY = "crossword-clash:push-reminder-ask";
/** The menu has painted by then; the ask should not be the first thing on screen. */
export const FIRST_ASK_DELAY_MS = 1500;

function asked(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Private mode: the OS remembers the answer anyway, and only "prompt" asks.
  }
}

type Ask = "first" | "reminder";

/**
 * The apps' push plumbing that runs without a screen: a device that was
 * allowed notifications re-registers on every launch (tokens rotate, and the
 * row's `last_seen_at` is what the sweep reads), and a tap on a notification
 * lands where its link says, through the same mapping as a universal link.
 *
 * It also asks for permission, with our own question before the OS sheet
 * (Andrew, 2026-11-13: the bare OS sheet 1.5 s after first open gave no reason
 * to say yes, and iOS only ever asks once):
 *  - on the first open, "Crossword Clash is better with notifications", with
 *    Not now on the left and Enable on the right. Only Enable shows the OS
 *    sheet; a grant registers the token under the default preferences (room
 *    invites and friend requests on, the daily reminder off).
 *  - after a daily, once its finish dialog is closed (never inside it, where
 *    sharing comes first), "Want a reminder tomorrow?", to a device the OS
 *    has not asked yet. Remind me shows the OS sheet and turns the reminder on.
 * Each is shown once per device and only while the OS still says "prompt".
 */
export function PushEffects() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const sessionUserId = useMaybeAccount()?.sessionUserId ?? null;
  const [ask, setAsk] = useState<Ask | null>(null);

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
    if (!pushAvailable() || !sessionUserId || firstAskStarted.current || asked(PUSH_FIRST_ASK_KEY)) return;
    const timer = window.setTimeout(async () => {
      if (firstAskStarted.current) return;
      firstAskStarted.current = true;
      try {
        if ((await checkPushPermission()) !== "prompt") {
          remember(PUSH_FIRST_ASK_KEY);
          return;
        }
        track("push_ask_shown", { placement: "first_open" });
        setAsk("first");
      } catch (err) {
        console.warn("Push first ask:", err);
      }
    }, FIRST_ASK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [sessionUserId]);

  // The reminder ask: when a daily's finish dialog closes, never over it.
  useEffect(() => {
    if (!pushAvailable() || !sessionUserId) return;
    const onClosed = () => {
      if (asked(PUSH_REMINDER_ASK_KEY)) return;
      void checkPushPermission().then((perm) => {
        if (perm !== "prompt") return;
        remember(PUSH_REMINDER_ASK_KEY);
        track("push_ask_shown", { placement: "after_daily" });
        setAsk((current) => current ?? "reminder");
      });
    };
    window.addEventListener(DAILY_FINISH_CLOSED_EVENT, onClosed);
    return () => window.removeEventListener(DAILY_FINISH_CLOSED_EVENT, onClosed);
  }, [sessionUserId]);

  const answer = useCallback(
    async (yes: boolean) => {
      const which = ask;
      setAsk(null);
      if (!which || !sessionUserId) return;
      const placement = which === "first" ? "first_open" : "after_daily";
      if (which === "first") remember(PUSH_FIRST_ASK_KEY);
      if (!yes) {
        track("push_ask_declined", { placement });
        return;
      }
      try {
        track("push_permission_prompted", { placement });
        const result = await enablePush(sessionUserId, { locale: i18n.language });
        track("push_permission_result", { placement, granted: result === "granted" });
        if (which === "reminder" && result === "granted") {
          const next = await savePushPrefs(sessionUserId, { ...((await fetchPushPrefs(sessionUserId)) ?? {}), daily_reminder: true });
          track("reminder_toggled", { on: true, hour: next.daily_reminder_hour, placement });
        }
      } catch (err) {
        console.warn("Push ask:", err);
      }
    },
    [ask, sessionUserId, i18n.language],
  );

  useEffect(
    () =>
      startPushTaps((target) => {
        track("push_opened");
        if (target.kind === "hash") window.location.hash = target.hash;
        else navigate(target.to);
      }),
    [navigate],
  );

  return ask ? <PushAsk which={ask} onAnswer={answer} /> : null;
}

/** Our own question before the OS sheet. Not now sits left; the yes is the one filled button, on the right. */
function PushAsk({ which, onAnswer }: { which: Ask; onAnswer: (yes: boolean) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, () => onAnswer(false));
  const first = which === "first";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-5">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="push-ask-title" className="modal-enter w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-overlay outline-none">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Bell className="size-7" aria-hidden="true" />
        </span>
        <h2 id="push-ask-title" className="mt-4 font-display text-xl font-bold tracking-tight text-ink text-balance">
          {t(first ? "push.askTitle" : "push.reminderAskTitle")}
        </h2>
        <p className="mt-2 text-muted text-balance">{t(first ? "push.askBody" : "push.reminderAskBody")}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" block onClick={() => onAnswer(false)}>
            {t("push.askNotNow")}
          </Button>
          <Button size="lg" block onClick={() => onAnswer(true)}>
            {t(first ? "push.askEnable" : "push.reminderAskYes")}
          </Button>
        </div>
      </div>
    </div>
  );
}
