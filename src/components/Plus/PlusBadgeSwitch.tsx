import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SwitchRow } from "../Push/NotificationSettings";
import { PlusBadge } from "../ui/PlusBadge";
import { fetchShowPlusBadge, setKnownPlusBadge, setShowPlusBadge } from "../../lib/plusBadges";

/**
 * "Show my Plus badge" on the account page (docs/plus-expansion-spec.md §5.2;
 * on by default, Andrew, 2026-11-13). Saved as soon as it changes; the server
 * derives the public badge from it and the subscription.
 */
export function PlusBadgeSwitch({ userId, username }: { userId: string; username?: string | null }) {
  const { t } = useTranslation();
  const [show, setShow] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchShowPlusBadge(userId).then((v) => live && setShow(v));
    return () => {
      live = false;
    };
  }, [userId]);

  const change = (next: boolean) => {
    const before = show;
    setShow(next);
    setFailed(false);
    setShowPlusBadge(userId, next).then(
      (badge) => setKnownPlusBadge({ userId, username }, badge),
      () => {
        setShow(before);
        setFailed(true);
      },
    );
  };

  return (
    <div className="-mx-4">
      <SwitchRow
        id="plus-badge-switch"
        title={
          <span className="inline-flex items-center gap-1.5">
            {t("plus.showBadge")}
            <PlusBadge interactive={false} />
          </span>
        }
        hint={t("plus.showBadgeBody")}
        checked={show ?? true}
        disabled={show === null}
        onChange={change}
      >
        {failed && <p role="alert" className="mt-1 text-sm text-red-700">{t("plus.showBadgeFailed")}</p>}
      </SwitchRow>
    </div>
  );
}
