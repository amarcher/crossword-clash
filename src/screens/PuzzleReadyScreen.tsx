import { useCallback, useEffect, useMemo, useRef } from "react";
import { Navigate, useNavigate } from "react-router";
import { PuzzleReady } from "../components/PuzzleReady";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { compressPuzzleToHash } from "../lib/puzzleUrl";
import { getDisplayNytStreak } from "../lib/soloStats";
import { track } from "../lib/analytics";

export function PuzzleReadyScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();

  // A puzzle reached this screen via the bookmarklet (postMessage/clipboard,
  // tagged origin) or a shared/challenge #puzzle= URL. Report once, and tell
  // the two apart — they answer very different questions.
  const importReportedRef = useRef(false);
  useEffect(() => {
    if (importReportedRef.current || !game.urlPuzzle) return;
    importReportedRef.current = true;
    track("puzzle_imported", {
      source: game.urlPuzzle.origin === "nyt-bookmarklet" ? "bookmarklet" : "url",
      title: game.urlPuzzle.title,
      size: `${game.urlPuzzle.width}x${game.urlPuzzle.height}`,
    });
  }, [game.urlPuzzle]);

  const nytStreak = useMemo(
    () => (game.urlPuzzle?.origin === "nyt-bookmarklet" ? getDisplayNytStreak() : 0),
    [game.urlPuzzle],
  );

  const handlePlaySolo = useCallback(async () => {
    if (!game.urlPuzzle) return;
    await game.handleSoloPuzzleLoaded(game.urlPuzzle);
    navigate("/solo/play");
  }, [game, navigate]);

  const handleHostGame = useCallback(() => {
    if (!game.urlPuzzle) return;
    game.loadPuzzle(game.urlPuzzle);
    navigate("/host-game/name");
  }, [game, navigate]);

  const handleHostOnTV = useCallback(() => {
    if (!game.urlPuzzle) return;
    const hash = compressPuzzleToHash(game.urlPuzzle);
    window.location.href = "/host" + hash;
  }, [game.urlPuzzle]);

  if (!game.urlPuzzle) {
    return <Navigate to="/" replace />;
  }

  return (
    <PuzzleReady
      puzzle={game.urlPuzzle}
      showHostOptions={!!user}
      nytStreak={nytStreak}
      onPlaySolo={handlePlaySolo}
      onHostGame={handleHostGame}
      onHostOnTV={handleHostOnTV}
    />
  );
}
