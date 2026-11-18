import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarX2, Loader2, Timer } from "lucide-react";
import { Button, Card, MiniGridThumb, TransitionLink } from "../components/ui";
import { PlusBadge } from "../components/ui/PlusBadge";
import { FlowPage } from "../components/Flow";
import { SharedRace } from "../components/Race/SharedRace";
import { runtimeDeps } from "../components/CompletionModal/ShareResultButton";
import { useGame } from "../contexts/GameContext";
import { useMaybeAccount } from "../contexts/AccountContext";
import { fetchBonusCard, loadBonusPuzzle, shapePuzzle, type BonusCard } from "../lib/bonus";
import { bonusPath, buildPuzzleLink, isDailyDay, parseDailyChallenge, parseRaceLink } from "../lib/dailyChallenge";
import { fetchReplayShare, ghostFromReplay } from "../lib/replayShare";
import type { Ghost } from "../lib/race";
import { SHARE_URL } from "../lib/resultCard";
import { shareText } from "../lib/shareSheet";
import { track } from "../lib/analytics";
import { leaderboardPath, todayKey } from "../lib/dailyLeaderboard";
import { formatShareDay } from "../lib/shareBlock";
import { formatDuration, puzzleIdentity } from "../lib/soloStats";
import type { Puzzle } from "../types/puzzle";
import { NotFoundScreen } from "./NotFoundScreen";
import { NoticeScreen, primaryButtonClass } from "./RouteErrorScreen";

// Loaded once the sender's solve has arrived: a link without one never needs it.
const FriendRaceDialog = lazy(() => import("../components/Race/FriendRaceDialog").then((m) => ({ default: m.FriendRaceDialog })));

/**
 * `/bonus/:day` — a Daily Plus link (dailyChallenge.buildPuzzleLink): a
 * finish's challenge (`?beat=102&by=Archer&r=<replay share id>`) or a shared
 * race (`?r=<id>&race=2&who=…`). The bonus is Plus only, so what the link
 * opens depends on the viewer, once their entitlement is known (`plusReady`):
 * - Plus: the day's puzzle is loaded. A challenge goes to the challenge flow,
 *   as a daily link's does (DailyPuzzleScreen → ChallengeScreen); a shared
 *   race opens here over the page (SharedRace), "Let me solve it" starting
 *   the puzzle; a link with neither opens that day's bonus board.
 * - Everyone else gets what a daily link gives someone who has not solved it
 *   (Andrew, 2026-11-18): the race dialog playing the sender's squares (or
 *   the shared race), no letters, with "Let me solve it" as its one action,
 *   which here opens the paywall. The puzzle is never requested: the dialog's
 *   grid is the public card's shape (`shapePuzzle`, no answers and no clues)
 *   and the solve is the link's replay code, which holds squares and times
 *   only. Closing the dialog leaves the page: who, how fast, and the same
 *   action.
 */
export function BonusLinkScreen() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setUrlPuzzle, setUrlChallenge, handleSoloPuzzleLoaded } = useGame();
  const account = useMaybeAccount();
  const day = isDailyDay(params.day) ? params.day : null;
  const search = location.search;
  const unsignedName = t("challenge.unsignedName");
  // A bonus is released a day early by UTC (bonus_cards): not before its local day.
  const released = !!day && day <= todayKey();
  // No account provider means nobody here can be Plus.
  const known = !account || account.plusReady;
  const plus = !!account?.plus;
  const challenge = useMemo(() => parseDailyChallenge(search, unsignedName), [search, unsignedName]);
  // A shared race: a clip with no time to beat.
  const race = useMemo(() => parseRaceLink(search), [search]);
  const [missing, setMissing] = useState(false);
  const [card, setCard] = useState<BonusCard | null>(null);
  // The puzzle itself, kept here only for a Plus viewer of a shared race.
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

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
      void loadBonusPuzzle(day).then((loaded) => {
        if (!alive) return;
        if (!loaded) {
          setMissing(true);
        } else if (challenge) {
          setUrlPuzzle(loaded);
          setUrlChallenge({ ...challenge, ref: { bonusDay: day } });
          navigate("/challenge", { replace: true });
        } else if (race) {
          setPuzzle(loaded);
        } else {
          navigate(leaderboardPath("bonus", day === todayKey() ? null : day), { replace: true });
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [day, released, known, plus, challenge, race, setUrlPuzzle, setUrlChallenge, navigate]);

  // The sender's solve for a viewer without Plus, from the link's replay code: null while loading or when there is none.
  const replayId = challenge?.replay ?? null;
  const senderName = challenge?.name ?? "";
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [watching, setWatching] = useState(true);
  const shape = useMemo(() => (card ? shapePuzzle(card) : null), [card]);
  useEffect(() => {
    if (!replayId || !card || plus) return;
    let live = true;
    void fetchReplayShare(replayId).then((code) => {
      if (!live || !code) return;
      const found = ghostFromReplay(code, replayId, senderName);
      // A clip of some other grid is not this puzzle's solve.
      if (!found || found.events.some((e) => e[1] >= card.width * card.height || card.blocks[e[1]] === "#")) return;
      setGhost(found);
      track("challenge_replay_shown", { seconds: found.seconds, versus: false });
    });
    return () => {
      live = false;
    };
  }, [replayId, senderName, card, plus]);
  const openPaywall = account?.openPaywall;
  const unlock = useCallback(() => {
    if (day) openPaywall?.({ placement: "bonus-link", feature: "bonus", returnTo: bonusPath(day) + search });
  }, [openPaywall, day, search]);
  const start = useCallback(async () => {
    if (!puzzle || !day) return;
    track("bonus_started", { day, from: "link" });
    if ((await handleSoloPuzzleLoaded(puzzle)) === false) return;
    navigate("/solo/play");
  }, [puzzle, day, handleSoloPuzzleLoaded, navigate]);
  const forward = useCallback(async () => {
    if (!day || !challenge) return "failed" as const;
    const url = buildPuzzleLink(SHARE_URL, { bonusDay: day }, { seconds: challenge.seconds, name: challenge.name, replay: challenge.replay });
    // The link alone: its preview names the solver and the time.
    const result = await shareText({ text: url, body: "", url, title: card?.title ?? "" }, await runtimeDeps());
    if (result.outcome === "shared" || result.outcome === "copied") track("challenge_forwarded", { method: result.method });
    return result.outcome;
  }, [day, challenge, card]);
  const close = useCallback(() => setWatching(false), []);

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

  // What the page is drawn from: the puzzle for Plus (a shared race), the card's shape for everyone else.
  const board = plus ? puzzle : shape;
  if (!known || !board) {
    return (
      <div className="flex min-h-app items-center justify-center p-6" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("dailyLink.loading", { daily: bonusLabel, date: dateLabel })}
        </p>
      </div>
    );
  }

  const solve = plus ? () => void start() : unlock;
  return (
    <FlowPage
      eyebrow={<PlusBadge interactive={false} size="2.5rem" />}
      title={challenge ? t("bonusLink.heading", { name: challenge.name }) : t("bonusLink.headingPlain")}
      subtitle={`${dateLabel} · ${card?.theme ? `${card.title} · ${card.theme}` : board.title}`}
      onBack={() => navigate("/menu")}
      backLabel={t("completion.backToMenu")}
    >
      <Card className="grid gap-5 p-5" data-testid="bonus-link-landing">
        <div className="flex items-center gap-4">
          <MiniGridThumb puzzle={board} className="w-20 shrink-0" />
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            {challenge && <Timer className="size-5 shrink-0 text-gold-500" aria-hidden="true" />}
            {challenge ? t("challenge.targetTime", { name: challenge.name, time: formatDuration(challenge.seconds) }) : t("bonus.meta", { width: board.width, height: board.height })}
          </p>
        </div>
        <div className="grid gap-2">
          <Button size="lg" block onClick={solve}>
            {t("challenge.solveYourself")}
          </Button>
          {!plus && <p className="text-center text-sm text-balance text-muted">{t("bonusLink.pitch")}</p>}
        </div>
      </Card>
      {watching && !plus && ghost && (
        <Suspense fallback={null}>
          <FriendRaceDialog
            puzzle={board}
            solves={[{ id: ghost.userId, name: ghost.name, color: ghost.color, seconds: ghost.seconds, events: ghost.events }]}
            letters={false}
            shareRef={{ bonusDay: day }}
            cta={{ label: t("challenge.solveYourself"), onClick: unlock }}
            onForward={forward}
            onClose={close}
          />
        </Suspense>
      )}
      {watching && race && (
        <SharedRace
          puzzle={board}
          puzzleKey={plus ? puzzleIdentity(board) : card?.identity ?? ""}
          shareId={race.id}
          names={race.names}
          shareRef={{ bonusDay: day }}
          onSolve={solve}
          locked={!plus}
          onClose={close}
        />
      )}
    </FlowPage>
  );
}
