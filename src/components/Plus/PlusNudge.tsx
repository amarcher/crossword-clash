import { useTranslation } from "react-i18next";
import { PlusSeal } from "../ui/PlusBadge";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { plusEnabled, type PlusFeature } from "../../lib/plus";
import { Button } from "../ui";

interface PlusNudgeProps {
  title: string;
  body: string;
  /** Where the pitch sits, for the funnel (`paywall_viewed { placement }`). */
  placement: string;
  feature: PlusFeature;
  returnTo?: string;
  className?: string;
}

/**
 * A benefit-led Plus pitch for a screen whose feature Plus extends — the
 * archive's backlog, the studio behind community puzzles. One row: gold tile,
 * title, body, About Plus. Renders nothing while the launch switch is off,
 * outside AccountProvider, where accounts aren't offered, before the session
 * and entitlements are known, and for a subscriber — so the screens that use
 * it need no guard of their own. Anonymous visitors see it too: the paywall
 * asks them to sign in first.
 */
export function PlusNudge({ title, body, placement, feature, returnTo, className = "" }: PlusNudgeProps) {
  const { t } = useTranslation();
  const account = useMaybeAccount();
  if (!plusEnabled() || !account || !account.available || !account.ready || !account.plusReady || account.plus) return null;
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-gold-50 p-3 text-left ring-1 ring-gold-100 ${className}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-gold-700 ring-1 ring-gold-100">
        <PlusSeal size="1.5rem" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-ink">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{body}</p>
      </div>
      <Button size="sm" onClick={() => account.openPaywall({ placement, feature, returnTo })}>
        {t("plus.about")}
      </Button>
    </div>
  );
}
