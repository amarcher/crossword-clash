import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../ui";
import { fetchSoloLeaderboardPreference, saveSoloLeaderboardPreference } from "../../lib/leaderboardPreference";

/** Private account metadata, shared across devices; changing it never edits old results. */
export function LeaderboardSettings({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(false);
    void fetchSoloLeaderboardPreference(userId).then(value => {
      if (live) setEnabled(value);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [userId, attempt]);

  async function toggle() {
    if (enabled === null || saving) return;
    setSaving(true);
    setError(false);
    try {
      await saveSoloLeaderboardPreference(userId, !enabled);
      setEnabled(!enabled);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <Card className="p-5 sm:p-6">
    <h2 className="font-display text-lg font-bold text-ink">{t("leaderboardSettings.title")}</h2>
    <div className="mt-4 flex items-center justify-between gap-4">
      <span id="solo-board-setting-label" className="font-semibold text-ink">{t("leaderboardSettings.label")}</span>
      <button
        type="button"
        role="switch"
        aria-labelledby="solo-board-setting-label"
        aria-describedby="solo-board-setting-hint"
        aria-checked={enabled === true}
        aria-busy={saving || enabled === null}
        disabled={enabled === null || saving}
        onClick={() => void toggle()}
        className="inline-flex min-h-11 min-w-14 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
      >
        <span className={`relative h-7 w-12 rounded-full transition-colors motion-reduce:transition-none ${enabled ? "bg-brand-600" : "bg-line-strong"}`}>
          <span className={`absolute left-1 top-1 size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </span>
      </button>
    </div>
    <p id="solo-board-setting-hint" className="mt-2 text-sm leading-relaxed text-muted">{t("leaderboardSettings.hint")}</p>
    <p className="mt-2 text-xs leading-relaxed text-muted">{t("leaderboardSettings.existing")}</p>
    {(saving || (enabled === null && !error)) && <p role="status" className="mt-3 text-sm text-muted">{t(saving ? "leaderboardSettings.saving" : "leaderboardSettings.loading")}</p>}
    {error && <div className="mt-3"><p role="alert" className="text-sm text-ink">{t("leaderboardSettings.error")}</p>{enabled === null && <Button variant="secondary" className="mt-2" onClick={() => setAttempt(n => n + 1)}>{t("leaderboardSettings.retry")}</Button>}</div>}
  </Card>;
}
