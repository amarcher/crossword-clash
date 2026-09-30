import { useCallback } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Flag, Timer } from "lucide-react";
import { AdSlot } from "../components/AdSlot";
import { Button, Card, MiniGridThumb } from "../components/ui";
import { FlowPage } from "../components/Flow";
import { useGame } from "../contexts/GameContext";
import { formatDuration, puzzleIdentity } from "../lib/soloStats";
import { saveChallenge } from "../lib/challenge";
import { track } from "../lib/analytics";

/**
 * Landing screen for an incoming "challenge a friend" link. Shows who challenged
 * you, on which puzzle, and the ghost time to beat — then loads the puzzle into
 * solo play with the ghost target stored for the completion comparison.
 */
export function ChallengeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const game = useGame();
  const puzzle = game.urlPuzzle;
  const challenge = game.urlChallenge;

  const handleAccept = useCallback(async () => {
    if (!puzzle || !challenge) return;
    saveChallenge({
      key: puzzleIdentity(puzzle),
      name: challenge.name,
      seconds: challenge.seconds,
    });
    track("challenge_accepted", {
      size: `${puzzle.width}x${puzzle.height}`,
      target_seconds: challenge.seconds,
    });
    await game.handleSoloPuzzleLoaded(puzzle);
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
    >
      <Card className="grid gap-5 p-5">
        <div className="flex items-center gap-4">
          <MiniGridThumb puzzle={puzzle} className="w-20 shrink-0" />
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Timer className="size-5 shrink-0 text-gold-500" aria-hidden="true" />
            {t("challenge.targetTime", { name: challenge.name, time: formatDuration(challenge.seconds) })}
          </p>
        </div>
        <Button size="lg" block onClick={handleAccept} autoFocus>
          {t("challenge.accept")}
        </Button>
      </Card>
      <div className="mt-6 flex justify-center">
        <AdSlot placement="puzzle-ready-bottom" />
      </div>
    </FlowPage>
  );
}
