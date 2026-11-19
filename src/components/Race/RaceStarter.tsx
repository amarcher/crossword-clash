import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "../ui";
import { formatDuration } from "../../lib/soloStats";
import { MAX_GHOSTS, type RaceCandidate } from "../../lib/race";
import { ModePreview } from "../GameLobby/ModePreview";

interface RaceStarterProps {
  candidates: RaceCandidate[];
  /** Ids to tick and open the picker with (a Race tap on the daily board). */
  preselect: string[];
  onStart: (userIds: string[]) => Promise<boolean>;
}

/**
 * The offer above an untouched grid when someone's solve of this puzzle can
 * be raced (race.ts): friends first, then the fastest public solvers. A tap
 * opens a short picker (up to MAX_GHOSTS). Shown only when the puzzle opened
 * without the start card (SoloStartGate), which asks this first.
 */
export function RaceStarter({ candidates, preselect, onStart }: RaceStarterProps) {
  const { t } = useTranslation();
  const valid = preselect.filter((id) => candidates.some((c) => c.userId === id));
  const [open, setOpen] = useState(valid.length > 0);
  const [picked, setPicked] = useState<string[]>(valid.length ? valid : candidates.slice(0, 1).map((c) => c.userId));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const friends = candidates.filter((c) => c.friend);
  const lead = friends[0] ?? candidates[0];

  const toggle = (id: string) =>
    setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length < MAX_GHOSTS ? [...now, id] : now));

  const start = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await onStart(picked);
    setBusy(false);
    if (!ok) setFailed(true);
  };

  const offer = friends.length
    ? friends.length === 1
      ? t("ghostRace.offerFriend", { name: lead.username })
      : t("ghostRace.offerFriends", { name: lead.username, count: friends.length - 1 })
    : t("ghostRace.offerPublic", { count: candidates.length });

  return (
    <section aria-label={t("ghostRace.pickTitle")} className="mt-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-line">
      <div className="flex items-center gap-2">
        <Flag className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">{offer}</p>
        {!open && (
          <Button
            variant="soft"
            size="sm"
            onClick={() => setOpen(true)}
          >
            {t("ghostRace.raceButton")}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-2">
          <p className="text-xs text-muted">{t("ghostRace.pickBody", { max: MAX_GHOSTS })}</p>
          <div className="mt-2 rounded-lg bg-surface-sunken p-3">
            <ModePreview mode="ghost" label={t("modePreview.ghostDesc")} />
            <p className="mt-2 text-xs leading-snug text-muted">{t("modePreview.ghostDesc")}</p>
          </div>
          <ul className="mt-1.5 flex max-h-48 flex-col overflow-y-auto">
            {candidates.map((c) => {
              const on = picked.includes(c.userId);
              return (
                <li key={c.userId}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm hover:bg-surface-sunken">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-600"
                      checked={on}
                      disabled={!on && picked.length >= MAX_GHOSTS}
                      onChange={() => toggle(c.userId)}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{c.username}</span>
                    {c.friend && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">{t("ghostRace.friend")}</span>}
                    {c.seconds !== null && <span className="text-xs tabular-nums text-muted">{formatDuration(c.seconds)}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          {failed && <p role="alert" className="mt-1 text-xs text-red-700">{t("ghostRace.failed")}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              {t("ghostRace.notNow")}
            </Button>
            <Button size="sm" onClick={() => void start()} disabled={busy || picked.length === 0}>
              {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t("ghostRace.start", { count: picked.length })}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
