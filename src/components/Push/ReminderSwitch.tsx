import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { usePushSettings } from "../../hooks/usePushSettings";

/**
 * The completion modal's "Remind me tomorrow" after a daily (docs/friends-spec.md
 * §3.3): the reminder switch where it makes sense, right after a finish. The
 * OS prompt is shown on the first tap, with the row's own sentence as the
 * context. Renders nothing on the web, after a denial, or once it is on.
 */
export function ReminderSwitch({ darkMode }: { darkMode?: boolean }) {
  const { t } = useTranslation();
  const { available, ready, prefs, permission, saving, update } = usePushSettings();
  if (!available || !ready || permission === "denied" || prefs.daily_reminder) return null;
  return (
    <button
      type="button"
      onClick={() => void update({ daily_reminder: true }, "completion")}
      disabled={saving}
      aria-busy={saving || undefined}
      className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left ring-1 ${darkMode ? "bg-stage-raised text-white ring-stage-line" : "bg-surface text-ink ring-line"} disabled:opacity-45`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${darkMode ? "bg-stage-line text-white" : "bg-brand-50 text-brand-600"}`}>
        <Bell className="size-4.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{t("push.remindTomorrow")}</span>
        <span className={`block text-sm leading-snug ${darkMode ? "text-stage-line" : "text-muted"}`}>{t("push.remindTomorrowHint")}</span>
      </span>
    </button>
  );
}
