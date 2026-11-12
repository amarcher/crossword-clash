import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../ui";
import { fetchRaceVisibility, setRaceVisibility, type RaceVisibility as Visibility } from "../../lib/race";

const OPTIONS: { value: Visibility; label: string }[] = [
  { value: "everyone", label: "ghostRace.visibilityEveryone" },
  { value: "friends", label: "ghostRace.visibilityFriends" },
  { value: "hidden", label: "ghostRace.visibilityHidden" },
];

/**
 * The account's "Who can race and replay your solves" (race.ts): anyone (the
 * default), friends only, or no one. Saved as soon as it changes.
 */
export function RaceVisibilityCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [value, setValue] = useState<Visibility | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchRaceVisibility(userId).then(
      (v) => live && setValue(v),
      () => live && setValue("everyone"),
    );
    return () => {
      live = false;
    };
  }, [userId]);

  const choose = (next: Visibility) => {
    const before = value;
    setValue(next);
    setFailed(false);
    setRaceVisibility(userId, next).catch(() => {
      setValue(before);
      setFailed(true);
    });
  };

  return (
    <Card className="p-5" aria-labelledby={titleId}>
      <p id={titleId} className="font-semibold text-ink">{t("ghostRace.visibilityTitle")}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{t("ghostRace.visibilityBody")}</p>
      <div role="radiogroup" aria-labelledby={titleId} aria-busy={value === null || undefined} className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={value === null}
            onClick={() => value !== o.value && choose(o.value)}
            className={`min-h-10 rounded-lg px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${value === o.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      {failed && <p role="alert" className="mt-2 text-sm text-red-700">{t("ghostRace.visibilitySaveFailed")}</p>}
    </Card>
  );
}
