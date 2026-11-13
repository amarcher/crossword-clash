import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, Loader2, Lock, Trophy } from "lucide-react";
import { Button, Card, Eyebrow, MiniGridThumb, TransitionLink } from "../ui";
import { PlusBadge } from "../ui/PlusBadge";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { useGame } from "../../contexts/GameContext";
import { useBestTimes } from "../../hooks/useSolveHistory";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { fetchBonusCard, loadBonusPuzzle, shapePuzzle, type BonusCard as Card_ } from "../../lib/bonus";
import { leaderboardPath } from "../../lib/dailyLeaderboard";
import { plusEnabled } from "../../lib/plus";
import { formatDuration } from "../../lib/soloStats";
import { track } from "../../lib/analytics";

/**
 * The "Daily Plus" on the menu (called the bonus in code, data and analytics; bonus.ts; Plus only, no free play): the card,
 * its title, theme and grid shape, for everyone; Play loads it for Plus and
 * opens the pitch for anyone else (`paywall_viewed { placement: "bonus" }`).
 * Nothing renders while Plus is switched off or when today has no bonus.
 */
export function BonusCard() {
  const { t } = useTranslation();
  const account = useMaybeAccount();
  const game = useGame();
  const navigate = useTransitionNavigate();
  const bestTimes = useBestTimes();
  const [card, setCard] = useState<Card_ | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const on = plusEnabled() && !!account?.available;

  useEffect(() => {
    if (!on) return;
    let live = true;
    void fetchBonusCard().then((c) => {
      if (!live || !c) return;
      setCard(c);
      track("bonus_viewed", {});
    });
    return () => {
      live = false;
    };
  }, [on]);

  if (!on || !card) return null;
  const best = bestTimes[card.identity];
  const solved = typeof best === "number";
  const plus = !!account?.plus;

  const play = async () => {
    if (!plus) {
      account?.openPaywall({ placement: "bonus", feature: "bonus" });
      return;
    }
    setBusy(true);
    setFailed(false);
    const puzzle = await loadBonusPuzzle(card.day);
    if (!puzzle) {
      setBusy(false);
      setFailed(true);
      return;
    }
    track("bonus_started", {});
    if ((await game.handleSoloPuzzleLoaded(puzzle)) === false) {
      setBusy(false);
      return;
    }
    game.setSoloTheme(card.theme ?? null);
    navigate("/solo/play");
  };

  return (
    <Card role="region" aria-label={t("bonus.eyebrow")} className={`overflow-hidden ${solved ? "bg-brand-50! border-brand-200!" : ""}`} data-solved={solved || undefined}>
      <div className="flex items-start gap-5 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 items-center gap-2">
            {/* Plus is marked with the badge's seal; the gold chip is the theme, as on the dailies. */}
            <Eyebrow className="inline-flex shrink-0 items-center gap-1 text-brand-600">
              {/* Short, so the theme chip beside it has room; the region's name says "Today's bonus". */}
              {t("bonus.eyebrowShort")}
              <PlusBadge interactive={false} size="1.15em" />
            </Eyebrow>
            {card.theme && (
              <span className="min-w-0 truncate rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-100" title={card.theme}>
                {card.theme}
              </span>
            )}
          </div>
          <h2 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">{card.title}</h2>
          {solved ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-brand-700 tabular-nums">
              <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
              {t("menu.dailySolvedIn", { time: formatDuration(best) })}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted tabular-nums">{t(plus ? "bonus.meta" : "bonus.metaLocked", { width: card.width, height: card.height })}
            </p>
          )}
        </div>
        {/* Locked for a viewer without Plus: the grid's shape shows through, a padlock over it. */}
        <div className="relative w-24 shrink-0 sm:w-28 lg:w-36">
          <MiniGridThumb puzzle={shapePuzzle(card)} solved={solved} className={plus ? "" : "opacity-60"} />
          {!plus && (
            <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
              <span className="grid size-10 place-items-center rounded-full bg-surface/95 text-gold-700 shadow-card ring-1 ring-gold-100">
                <Lock className="size-5" />
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-2 px-5 pb-5 sm:px-6 sm:pb-6">
        <Button size="lg" variant={solved ? "secondary" : "primary"} block onClick={() => void play()} disabled={busy} aria-busy={busy || undefined}>
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : !plus && <Lock className="size-4" aria-hidden="true" />}
          {plus ? t(solved ? "menu.dailyView" : "menu.dailyPlay") : t("bonus.playWithPlus")}
        </Button>
        {failed && (
          <p role="alert" className="text-sm text-red-700">
            {t("bonus.loadFailed")}
          </p>
        )}
      </div>
      {/* The bonus board is open to everyone, like the dailies': the times are public, the puzzle is not. */}
      <div className="flex items-center border-t border-line bg-surface-sunken/60 px-5 py-2.5 sm:px-6">
        <TransitionLink
          to={leaderboardPath("bonus")}
          onClick={() => track("mode_selected", { mode: "leaderboard", slot: "bonus" })}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-ink-soft hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Trophy className="size-4 text-gold-500" aria-hidden="true" />
          {t("bonus.boardLink")}
        </TransitionLink>
      </div>
    </Card>
  );
}
