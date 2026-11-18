import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Flag, Loader2, Timer } from "lucide-react";
import { AdSlot } from "../components/AdSlot";
import { Button, Card, MiniGridThumb } from "../components/ui";
import { FlowPage } from "../components/Flow";
import { useGame } from "../contexts/GameContext";
import { formatDuration, puzzleIdentity } from "../lib/soloStats";
import { clearChallenge, saveChallenge } from "../lib/challenge";
import { fetchReplayShare, ghostFromReplay } from "../lib/replayShare";
import { saveRace, type Ghost } from "../lib/race";
import { track } from "../lib/analytics";
import { buildPuzzleLink } from "../lib/dailyChallenge";
import { SHARE_URL } from "../lib/resultCard";
import { shareText } from "../lib/shareSheet";
import { runtimeDeps } from "../components/CompletionModal/ShareResultButton";
import type { RaceSolve } from "../lib/friendRace";

// Loaded once the sender's solve has arrived: a link without one never needs it.
const FriendRaceDialog = lazy(() => import("../components/Race/FriendRaceDialog").then((m) => ({ default: m.FriendRaceDialog })));

/**
 * Landing screen for an incoming "challenge a friend" link. Shows who challenged
 * you, on which puzzle, and the ghost time to beat — then loads the puzzle into
 * solo play with the ghost target stored for the completion comparison.
 *
 * A daily or community link that carries the sender's replay (`r`, replayShare.ts) offers to
 * race their actual solve by default: their squares fill on your clock as they
 * filled them, never their letters (race.ts). Free for whoever got the link
 * (Andrew, 2026-11-12): it is how a share turns into a new player. "Just solve
 * it" is the time-only challenge, and the only offer when the replay can't load.
 *
 * With a replay the link opens on the solve itself (Andrew, 2026-11-17: what a
 * share unfurls as is what it should open as): the race dialog plays the
 * sender's squares going in, no letters, with "Solve it yourself" as its one
 * primary action (the race) and passing the link on as a quiet icon. Closing
 * it leaves this page and its two offers.
 */
export function ChallengeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const game = useGame();
  const puzzle = game.urlPuzzle;
  const challenge = game.urlChallenge;

  // The sender's solve as a ghost, fetched as the screen opens: null while loading or when there is none.
  const replayId = challenge?.replay ?? null;
  const [ghost, setGhost] = useState<Ghost | null | "loading">(replayId ? "loading" : null);
  useEffect(() => {
    if (!replayId || !challenge) return;
    let live = true;
    void fetchReplayShare(replayId).then((code) => {
      if (live) setGhost(code ? ghostFromReplay(code, replayId, challenge.name, challenge.ref) : null);
    });
    return () => {
      live = false;
    };
  }, [replayId, challenge]);

  // The sender's solve, played as the link opens. Closed, it stays closed.
  const [watching, setWatching] = useState(true);
  const loaded = ghost && ghost !== "loading" ? ghost : null;
  const solves = useMemo<RaceSolve[]>(() => (loaded ? [{ id: loaded.userId, name: loaded.name, color: loaded.color, seconds: loaded.seconds, events: loaded.events }] : []), [loaded]);
  useEffect(() => {
    if (loaded) track("challenge_replay_shown", { seconds: loaded.seconds });
  }, [loaded]);
  const forward = useCallback(async () => {
    if (!puzzle || !challenge?.ref) return;
    const url = buildPuzzleLink(SHARE_URL, challenge.ref, { seconds: challenge.seconds, name: challenge.name, replay: challenge.replay });
    const body = t("challenge.forwardText", { name: challenge.name, title: puzzle.title, time: formatDuration(challenge.seconds) });
    await shareText({ text: `${body}\n${url}`, body, url, title: puzzle.title }, await runtimeDeps());
    track("challenge_forwarded", {});
  }, [puzzle, challenge, t]);

  const handleRace = useCallback(async () => {
    if (!puzzle || !challenge || !ghost || ghost === "loading") return;
    // The race's own results cover the time: no separate beat-my-time banner.
    clearChallenge();
    saveRace({ key: puzzleIdentity(puzzle), ghosts: [ghost] });
    track("challenge_accepted", { size: `${puzzle.width}x${puzzle.height}`, target_seconds: challenge.seconds, race: true });
    if (await game.handleSoloPuzzleLoaded(puzzle, undefined, { replay: true }) === false) return;
    navigate("/solo/play");
  }, [puzzle, challenge, ghost, game, navigate]);

  const handleAccept = useCallback(async () => {
    if (!puzzle || !challenge) return;
    saveRace(null);
    saveChallenge({
      key: puzzleIdentity(puzzle),
      name: challenge.name,
      seconds: challenge.seconds,
    });
    track("challenge_accepted", {
      size: `${puzzle.width}x${puzzle.height}`,
      target_seconds: challenge.seconds,
      race: false,
    });
    // Accepting a challenge is asking to solve it (again): never the solved grid.
    if (await game.handleSoloPuzzleLoaded(puzzle, undefined, { replay: true }) === false) return;
    navigate("/solo/play");
  }, [puzzle, challenge, game, navigate]);

  if (!puzzle || !challenge) {
    return <Navigate to="/" replace />;
  }

  return (
    <FlowPage
      eyebrow={
        <span className="grid size-10 place-items-center rounded-xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
          <Flag className="size-5" aria-hidden="true" />
        </span>
      }
      title={t("challenge.heading", { name: challenge.name })}
      subtitle={t("challenge.subtitle", { title: puzzle.title })}
      onBack={() => navigate("/menu")}
      backLabel={t("completion.backToMenu")}
    >
      <Card className="grid gap-5 p-5">
        <div className="flex items-center gap-4">
          <MiniGridThumb puzzle={puzzle} className="w-20 shrink-0" />
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Timer className="size-5 shrink-0 text-gold-500" aria-hidden="true" />
            {t("challenge.targetTime", { name: challenge.name, time: formatDuration(challenge.seconds) })}
          </p>
        </div>
        {ghost === "loading" ? (
          <Button size="lg" block disabled>
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t("challenge.loadingRace")}
          </Button>
        ) : ghost ? (
          <div className="grid gap-2">
            <Button size="lg" block onClick={() => void handleRace()} autoFocus>
              <Flag className="size-4" aria-hidden="true" />
              {t("challenge.raceButton", { name: challenge.name })}
            </Button>
            <p className="text-center text-sm text-muted">
              {t("challenge.raceHint", { name: challenge.name })} {ghost.link ? t("challenge.raceReplyNotice", { name: challenge.name }) : null}
            </p>
            <Button variant="ghost" block onClick={() => void handleAccept()}>
              {t("challenge.justSolve")}
            </Button>
          </div>
        ) : (
          <Button size="lg" block onClick={handleAccept} autoFocus>
            {t("challenge.accept")}
          </Button>
        )}
      </Card>
      <div className="mt-6 flex justify-center">
        <AdSlot placement="puzzle-ready-bottom" />
      </div>
      {watching && loaded && (
        <Suspense fallback={null}>
          <FriendRaceDialog
            puzzle={puzzle}
            solves={solves}
            letters={false}
            shareRef={challenge.ref}
            cta={{ label: t("challenge.solveYourself"), onClick: () => void handleRace() }}
            onForward={challenge.ref ? () => void forward() : undefined}
            onClose={() => setWatching(false)}
          />
        </Suspense>
      )}
    </FlowPage>
  );
}
