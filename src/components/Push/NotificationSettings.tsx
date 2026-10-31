import { useId } from "react";
import { useTranslation } from "react-i18next";
import { BellOff } from "lucide-react";
import { usePushSettings } from "../../hooks/usePushSettings";
import { Card, Eyebrow } from "../ui";
import type { PushPrefs } from "../../lib/pushRules";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

interface SwitchRowProps {
  id: string;
  title: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  children?: React.ReactNode;
}

/** A 56px switch row (the solo Autocheck switch's pattern): title, hint, a role="switch" button. */
export function SwitchRow({ id, title, hint, checked, disabled, onChange, children }: SwitchRowProps) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex min-h-11 items-center gap-3">
        <span className="min-w-0 flex-1">
          <span id={`${id}-label`} className="block font-semibold leading-snug text-ink">
            {title}
          </span>
          {hint && <span className="mt-0.5 block text-sm leading-snug text-muted">{hint}</span>}
        </span>
        <button
          type="button"
          role="switch"
          id={id}
          aria-checked={checked}
          aria-labelledby={`${id}-label`}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${checked ? "bg-brand-600" : "bg-line-strong"}`}
        >
          <span aria-hidden="true" className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[left] ${checked ? "left-[24px]" : "left-1"}`} />
        </button>
      </div>
      {children}
    </div>
  );
}

/**
 * The apps' notification switches (docs/friends-spec.md §3.3): the daily
 * reminder and its hour, room invites, friend requests, quiet hours and
 * whether invites may cross them. The OS prompt is only shown when a switch
 * is turned on; after a denial every row stays off and the card says where
 * to allow notifications. Renders nothing on the web.
 */
export function NotificationSettings({ placement = "account" }: { placement?: string }) {
  const { t } = useTranslation();
  const id = useId();
  const settings = usePushSettings();
  if (!settings.available) return null;
  const { prefs, permission, saving, update } = settings;
  const denied = permission === "denied";
  const set = (patch: Partial<PushPrefs>) => void update(patch, placement);

  return (
    <Card aria-busy={!settings.ready || saving || undefined}>
      <div className="px-4 pt-4">
        <Eyebrow as="h2">{t("push.heading")}</Eyebrow>
        <p className="mt-1 text-sm text-muted">{t("push.intro")}</p>
      </div>
      {denied && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl bg-surface-sunken p-3" role="status">
          <BellOff className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">{t("push.deniedTitle")}</p>
            <p className="text-muted">{t("push.deniedBody")}</p>
          </div>
        </div>
      )}
      <div className="mt-2 divide-y divide-line">
        <SwitchRow id={`${id}-reminder`} title={t("push.reminder")} hint={t("push.reminderHint", { hour: hourLabel(prefs.daily_reminder_hour) })} checked={prefs.daily_reminder} disabled={saving || denied} onChange={(on) => set({ daily_reminder: on })}>
          {prefs.daily_reminder && (
            <label className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">{t("push.reminderAt")}</span>
              <select
                value={prefs.daily_reminder_hour}
                disabled={saving}
                onChange={(e) => set({ daily_reminder_hour: Number(e.target.value) })}
                className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-base text-ink"
                aria-label={t("push.reminderAt")}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </SwitchRow>
        <SwitchRow id={`${id}-invites`} title={t("push.invites")} hint={t("push.invitesHint")} checked={prefs.room_invites && !denied} disabled={saving || denied} onChange={(on) => set({ room_invites: on })} />
        <SwitchRow id={`${id}-requests`} title={t("push.requests")} hint={t("push.requestsHint")} checked={prefs.friend_requests && !denied} disabled={saving || denied} onChange={(on) => set({ friend_requests: on })} />
        <SwitchRow id={`${id}-quiet`} title={t("push.quiet")} hint={t("push.quietHint", { start: hourLabel(prefs.quiet_start), end: hourLabel(prefs.quiet_end) })} checked={prefs.quiet_hours} disabled={saving || denied} onChange={(on) => set({ quiet_hours: on })}>
          {prefs.quiet_hours && (
            <SwitchRow id={`${id}-quiet-invites`} title={t("push.quietInvites")} checked={prefs.quiet_allow_invites} disabled={saving || denied} onChange={(on) => set({ quiet_allow_invites: on })} />
          )}
        </SwitchRow>
      </div>
    </Card>
  );
}
