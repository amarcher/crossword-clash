import { useCallback } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../components/Title";
import { AdSlot } from "../components/AdSlot";
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
    <div className="flex flex-col items-center justify-center h-dvh crossword-bg p-8">
      <Title variant="light" className="mb-6" />

      <div className="text-center mb-6 max-w-sm">
        <div className="text-5xl mb-3" role="img" aria-label="racing flag">🏁</div>
        <h2 className="text-xl font-bold text-neutral-800">
          {t("challenge.heading", { name: challenge.name })}
        </h2>
        <p className="text-sm text-neutral-600 mt-2">
          {t("challenge.subtitle", { title: puzzle.title })}
        </p>
        <p className="mt-4 inline-block rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-700">
          {t("challenge.targetTime", { name: challenge.name, time: formatDuration(challenge.seconds) })}
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleAccept}
          autoFocus
          className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {t("challenge.accept")}
        </button>
      </div>
      <div className="mt-4">
        <AdSlot placement="puzzle-ready-bottom" />
      </div>
    </div>
  );
}
