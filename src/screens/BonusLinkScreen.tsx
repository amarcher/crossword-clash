import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarX2, Loader2, Lock, Timer } from "lucide-react";
import { Button, Card, MiniGridThumb, TransitionLink } from "../components/ui";
import { PlusBadge } from "../components/ui/PlusBadge";
import { FlowPage } from "../components/Flow";
import { ReplayPreview } from "../components/CompletionModal/ReplayPreview";
import { useGame } from "../contexts/GameContext";
import { useMaybeAccount } from "../contexts/AccountContext";
import { fetchBonusCard, loadBonusPuzzle, shapePuzzle, type BonusCard } from "../lib/bonus";
import { bonusPath, isDailyDay, parseDailyChallenge } from "../lib/dailyChallenge";
import { leaderboardPath, todayKey } from "../lib/dailyLeaderboard";
import { formatShareDay } from "../lib/shareBlock";
import { formatDuration } from "../lib/soloStats";
import { NotFoundScreen } from "./NotFoundScreen";
import { NoticeScreen, primaryButtonClass } from "./RouteErrorScreen";

/**
 * `/bonus/:day` — a Daily Plus finish's share link
 * (`?beat=102&by=Archer&r=<replay share id>`, dailyChallenge.buildPuzzleLink).
 * The bonus is Plus only, so what the link opens depends on the viewer, once
 * their entitlement is known (`plusReady`):
 * - Plus: the day's puzzle is loaded and handed to the challenge flow, as a
 *   daily link's is (DailyPuzzleScreen → ChallengeScreen): the sender's
 *   squares to race, or the head-to-head for someone who has solved it. A
 *   link with no time opens that day's bonus board.
 * - Everyone else: the puzzle is never requested. The page says who solved it
 *   and how fast, plays their solve as squares (the link's own clip, no
 *   letters) and offers the puzzle through the paywall.
 */
export function BonusLinkScreen() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setUrlPuzzle, setUrlChallenge } = useGame();
  const account = useMaybeAccount();
  const day = isDailyDay(params.day) ? params.day : null;
  const search = location.search;
  const unsignedName = t("challenge.unsignedName");
  // A bonus is released a day early by UTC (bonus_cards): not before its local day.
  const released = !!day && day <= todayKey();
  // No account provider means nobody here can be Plus.
  const known = !account || account.plusReady;
  const plus = !!account?.plus;
  const [missing, setMissing] = useState(false);
  const [card, setCard] = useState<BonusCard | null>(null);

  useEffect(() => {
    if (!day || !released || !known) return;
    let alive = true;
    if (!plus) {
      // The public card only (title and grid shape): enough to say the day has a bonus.
      void fetchBonusCard(day).then((found) => {
        if (!alive) return;
        if (found) setCard(found);
        else setMissing(true);
      });
    } else {
      void loadBonusPuzzle(day).then((puzzle) => {
        if (!alive) return;
        if (!puzzle) {
          setMissing(true);
          return;
        }
        const challenge = parseDailyChallenge(search, unsignedName);
        if (!challenge) {
          navigate(leaderboardPath("bonus", day === todayKey() ? null : day), { replace: true });
          return;
        }
        setUrlPuzzle(puzzle);
        setUrlChallenge({ ...challenge, ref: { bonusDay: day } });
        navigate("/challenge", { replace: true });
      });
    }
    return () => {
      alive = false;
    };
  }, [day, released, known, plus, search, unsignedName, setUrlPuzzle, setUrlChallenge, navigate]);

  if (!day) return <NotFoundScreen />;

  const bonusLabel = t("bonus.eyebrow");
  const dateLabel = formatShareDay(day, i18n.language);

  if (missing || !released) {
    return (
      <NoticeScreen icon={CalendarX2} title={t("dailyLink.missingTitle", { daily: bonusLabel, date: dateLabel })} body={t("dailyLink.missingBody")}>
        <TransitionLink to="/menu" className={primaryButtonClass}>
          {t("errors.backToMenu")}
        </TransitionLink>
      </NoticeScreen>
    );
  }

  if (!known || plus || !card) {
    return (
      <div className="flex min-h-app items-center justify-center p-6" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("dailyLink.loading", { daily: bonusLabel, date: dateLabel })}
        </p>
      </div>
    );
  }

  const challenge = parseDailyChallenge(search, unsignedName);
  return (
    <FlowPage
      eyebrow={<PlusBadge interactive={false} size="2.5rem" />}
      title={challenge ? t("bonusLink.heading", { name: challenge.name }) : t("bonusLink.headingPlain")}
      subtitle={`${dateLabel} · ${card.theme ? `${card.title} · ${card.theme}` : card.title}`}
      onBack={() => navigate("/menu")}
      backLabel={t("completion.backToMenu")}
    >
      <Card className="grid gap-5 p-5" data-testid="bonus-link-landing">
        {challenge?.replay && <ReplayPreview id={challenge.replay} label={t("bonusLink.clipLabel", { name: challenge.name })} caption={t("bonusLink.clipCaption")} />}
        <div className="flex items-center gap-4">
          {!challenge?.replay && <MiniGridThumb puzzle={shapePuzzle(card)} className="w-20 shrink-0" />}
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            {challenge && <Timer className="size-5 shrink-0 text-gold-500" aria-hidden="true" />}
            {challenge ? t("challenge.targetTime", { name: challenge.name, time: formatDuration(challenge.seconds) }) : t("bonus.meta", { width: card.width, height: card.height })}
          </p>
        </div>
        <div className="grid gap-2">
          <Button size="lg" block onClick={() => account?.openPaywall({ placement: "bonus-link", feature: "bonus", returnTo: bonusPath(day) + search })}>
            <Lock className="size-4" aria-hidden="true" />
            {t("bonusLink.play")}
          </Button>
          <p className="text-center text-sm text-balance text-muted">{t("bonusLink.pitch")}</p>
        </div>
      </Card>
    </FlowPage>
  );
}
