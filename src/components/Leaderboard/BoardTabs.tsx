import { useTranslation } from "react-i18next";
import { TransitionLink } from "../ui";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { DAILY_SLOTS, type DailySlot } from "../../lib/dailyFeed";
import { leaderboardPath, type BoardSlot } from "../../lib/dailyLeaderboard";
import { plusEnabled } from "../../lib/plus";

const LG_QUERY = "(min-width: 64rem)";
const LABEL = { mini: "leaderboard.tabMini", midi: "leaderboard.tabMidi", large: "leaderboard.tabLarge", bonus: "bonus.eyebrow" } as const;

/**
 * The way from one day's board to its others, on every board: a phone shows
 * one daily at a time, so each gets a tab; from `lg` up the dailies share a
 * page and one tab stands for them. The Daily Plus board joins wherever Plus
 * is on offer. `day` is the past day being shown, carried across.
 */
export function BoardTabs({ active, day, slots = DAILY_SLOTS }: { active: BoardSlot; day: string | null; slots?: readonly DailySlot[] }) {
  const { t } = useTranslation();
  const wide = useMediaQuery(LG_QUERY);
  const account = useMaybeAccount();
  const bonus = plusEnabled() && !!account?.available;
  const tabs: { slot: BoardSlot; label: string; on: boolean }[] = wide
    ? [{ slot: "mini", label: t("leaderboard.tabDailies"), on: active !== "bonus" }]
    : slots.map((slot) => ({ slot, label: t(LABEL[slot]), on: active === slot }));
  if (bonus) tabs.push({ slot: "bonus", label: t(LABEL.bonus), on: active === "bonus" });
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={t("leaderboard.tabs")} className="mx-auto flex w-full max-w-sm gap-1 rounded-xl bg-surface-sunken p-1 ring-1 ring-line">
      {tabs.map((tab) => (
        <TransitionLink
          key={tab.slot}
          to={leaderboardPath(tab.slot, day)}
          replace
          aria-current={tab.on ? "page" : undefined}
          className={`inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${
            tab.on ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </TransitionLink>
      ))}
    </nav>
  );
}
