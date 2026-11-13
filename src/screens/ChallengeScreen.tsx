import { useCallback, useEffect, useState } from "react";
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

/**
 * Landing screen for an incoming "challenge a friend" link. Shows who challenged
 * you, on which puzzle, and the ghost time to beat — then loads the puzzle into
 * solo play with the ghost target stored for the completion comparison.
 *
 * A daily link that carries the sender's replay (`r`, replayShare.ts) offers to
 * race their actual solve by default: their squares fill on your clock as they
 * filled them, never their letters (race.ts). Free for whoever got the link
 * (Andrew, 2026-11-12): it is how a share turns into a new player. "Just solve
 * it" is the time-only challenge, and the only offer when the replay can't load.
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
      const daily = challenge.day && challenge.slot ? { day: challenge.day, slot: challenge.slot } : undefined;
      if (live) setGhost(code ? ghostFromReplay(code, replayId, challenge.name, daily) : null);
    });
    return () => {
      live = false;
    };
  }, [replayId, challenge]);

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
    </FlowPage>
  );
}
