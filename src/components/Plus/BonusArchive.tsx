import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, Lock, Trophy } from "lucide-react";
import { Button, Eyebrow, MiniGridThumb, TransitionLink } from "../ui";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { useGame } from "../../contexts/GameContext";
import { useBestTimes } from "../../hooks/useSolveHistory";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { fetchBonusCards, loadBonusPuzzle, shapePuzzle, type BonusCard } from "../../lib/bonus";
import { leaderboardPath } from "../../lib/dailyLeaderboard";
import { plusEnabled } from "../../lib/plus";
import { dayKey } from "../../lib/soloStats";
import { formatDuration } from "../../lib/soloStats";
import { track } from "../../lib/analytics";

/**
 * The archive's past bonuses (bonus.ts): one row per released day, newest
 * first. Plus plays any of them for good; anyone else sees the rows and the
 * pitch (`paywall_viewed { placement: "bonus-archive" }`). Nothing renders
 * without bonuses or while Plus is switched off.
 */
export function BonusArchive() {
  const { t, i18n } = useTranslation();
  const account = useMaybeAccount();
  const game = useGame();
  const navigate = useTransitionNavigate();
  const bestTimes = useBestTimes();
  const [cards, setCards] = useState<BonusCard[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const on = plusEnabled() && !!account?.available;

  useEffect(() => {
    if (!on) return;
    let live = true;
    // A bonus is out once it is today anywhere (UTC date + 1): tomorrow's is never listed here.
    void fetchBonusCards().then((rows) => live && setCards(rows.filter((c) => c.day <= dayKey(new Date()))));
    return () => {
      live = false;
    };
  }, [on]);

  if (!on || cards.length === 0) return null;
  const plus = !!account?.plus;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric" });

  const play = async (card: BonusCard) => {
    if (!plus) {
      account?.openPaywall({ placement: "bonus-archive", feature: "bonus", returnTo: "/archive" });
      return;
    }
    setBusy(card.day);
    setFailed(false);
    const puzzle = await loadBonusPuzzle(card.day);
    if (!puzzle) {
      setBusy(null);
      setFailed(true);
      return;
    }
    track("bonus_started", { day: card.day });
    if ((await game.handleSoloPuzzleLoaded(puzzle)) === false) {
      setBusy(null);
      return;
    }
    game.setSoloTheme(card.theme ?? null);
    navigate("/solo/play");
  };

  return (
    <section className="mt-8" aria-labelledby="archive-bonus">
      <div className="flex items-center justify-between gap-3 px-1">
        <Eyebrow as="h2" id="archive-bonus">
          {t("bonus.archiveHeading")}
        </Eyebrow>
        <TransitionLink
          to={leaderboardPath("bonus")}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-ink-soft hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Trophy className="size-4 text-gold-500" aria-hidden="true" />
          {t("menu.dailyLeaderboard")}
        </TransitionLink>
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {t("bonus.loadFailed")}
        </p>
      )}
      <ul className="mt-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {cards.map((card) => {
          const best = bestTimes[card.identity];
          return (
            <li key={card.day} className={`flex min-h-16 items-center gap-3 px-4 py-2.5 ${typeof best === "number" ? "bg-brand-50" : ""}`} data-solved={typeof best === "number" || undefined}>
              <span className="relative w-10 shrink-0">
                <MiniGridThumb puzzle={shapePuzzle(card)} solved={typeof best === "number"} className={plus ? "" : "opacity-60"} />
                {!plus && (
                  <span className="absolute inset-0 grid place-items-center text-gold-700" aria-hidden="true">
                    <Lock className="size-4 drop-shadow-[0_0_2px_white]" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-snug text-ink">{card.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-sm leading-snug text-muted tabular-nums">
                  {typeof best === "number" && <CircleCheck className="size-3.5 shrink-0 text-brand-600" aria-hidden="true" />}
                  {dateFormat.format(new Date(`${card.day}T12:00:00`))} · {card.width}×{card.height}
                  {typeof best === "number" ? ` · ${formatDuration(best)}` : ""}
                </span>
              </span>
              <Button size="sm" variant={plus ? "secondary" : "soft"} onClick={() => void play(card)} disabled={busy !== null} aria-busy={busy === card.day || undefined}>
                {!plus && <Lock className="size-3.5" aria-hidden="true" />}
                {plus ? t(typeof best === "number" ? "archive.view" : "archive.play") : t("bonus.unlock")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
