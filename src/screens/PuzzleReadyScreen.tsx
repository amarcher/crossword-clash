import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { PuzzleReady } from "../components/PuzzleReady";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { compressPuzzleToHash } from "../lib/puzzleUrl";
import { useStreaks } from "../hooks/useSolveHistory";
import { track } from "../lib/analytics";
import { puzzleIdentity } from "../lib/soloStats";
import { SharedRace } from "../components/Race/SharedRace";
import type { PuzzleRef } from "../types/puzzle";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";

export function PuzzleReadyScreen() {
  const navigate = useTransitionNavigate();
  // Exits that clear the game first stay plain: the cleared screen's own
  // redirect runs before a cross-fade could capture it.
  const exit = useNavigate();
  const { user } = useAuth();
  const game = useGame();
  // A shared race's link (DailyPuzzleScreen): the race plays over this page until it is closed.
  const linked = (useLocation().state as { race?: { id: string; names: string[]; ref: PuzzleRef } } | null)?.race ?? null;
  const [raceOpen, setRaceOpen] = useState(true);
  const closeRace = useCallback(() => setRaceOpen(false), []);

  // A puzzle reached this screen via the bookmarklet (postMessage/clipboard,
  // tagged origin) or a shared/challenge #puzzle= URL. Report once, and tell
  // the two apart — they answer very different questions.
  const importReportedRef = useRef(false);
  useEffect(() => {
    if (importReportedRef.current || !game.urlPuzzle) return;
    importReportedRef.current = true;
    track("puzzle_imported", {
      import_source: game.urlPuzzle.origin === "nyt-bookmarklet" ? "bookmarklet" : "url",
      title: game.urlPuzzle.title,
      size: `${game.urlPuzzle.width}x${game.urlPuzzle.height}`,
    });
  }, [game.urlPuzzle]);

  const streaks = useStreaks();
  const nytStreak = game.urlPuzzle?.origin === "nyt-bookmarklet" ? streaks.nyt : 0;

  const handlePlaySolo = useCallback(async () => {
    if (!game.urlPuzzle) return;
    if (await game.handleSoloPuzzleLoaded(game.urlPuzzle) === false) return;
    navigate("/solo/play");
  }, [game, navigate]);

  const handleHostOnTV = useCallback(() => {
    if (!game.urlPuzzle) return;
    const hash = compressPuzzleToHash(game.urlPuzzle);
    window.location.href = "/host" + hash;
  }, [game.urlPuzzle]);

  const handleBack = useCallback(() => {
    // Drop the imported puzzle so the index route doesn't bounce straight back here.
    game.setUrlPuzzle(null);
    exit("/menu");
  }, [game, exit]);

  if (!game.urlPuzzle) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <PuzzleReady
        puzzle={game.urlPuzzle}
        showHostOptions={!!user}
        nytStreak={nytStreak}
        onPlaySolo={handlePlaySolo}
        onHostOnTV={handleHostOnTV}
        onBack={handleBack}
      />
      {linked && raceOpen && <SharedRace puzzle={game.urlPuzzle} puzzleKey={puzzleIdentity(game.urlPuzzle)} shareId={linked.id} names={linked.names} shareRef={linked.ref} onSolve={() => void handlePlaySolo()} onClose={closeRace} />}
    </>
  );
}
