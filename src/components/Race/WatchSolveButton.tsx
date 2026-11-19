import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "../ui";
import { useAuth } from "../../contexts/AuthContext";
import { useGame } from "../../contexts/GameContext";
import { useBestTimes } from "../../hooks/useSolveHistory";
import { useRaceName } from "../../hooks/useRaceName";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import type { RaceSolve } from "../../lib/friendRace";
import { saveRaceIntent } from "../../lib/race";
import { loadViewerRace } from "../../lib/viewerRace";
import { track } from "../../lib/analytics";
import type { Puzzle } from "../../types/puzzle";

const FriendRaceDialog = lazy(() => import("./FriendRaceDialog").then((m) => ({ default: m.FriendRaceDialog })));

/**
 * "Watch" beside a friend who has already solved the puzzle a race is about
 * (Race friends; Andrew, 2026-11-18: a friend who has finished it is not
 * someone to bring into a live room). Opens the race dialog on their recorded
 * solve, beside the viewer's own when there is one. A viewer who has not
 * solved it sees squares only and gets "Race their solve": the puzzle on
 * their own clock with that friend's solve running beside it (Plus, as on
 * the leaderboard's rows).
 */
export function WatchSolveButton({ puzzle, puzzleKey, friendId, friendName }: { puzzle: Puzzle; puzzleKey: string; friendId: string; friendName: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const game = useGame();
  const navigate = useTransitionNavigate();
  const best = useBestTimes()[puzzleKey];
  const ownName = useRaceName();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [race, setRace] = useState<{ solves: RaceSolve[]; letters: boolean; own: boolean } | null>(null);

  const open = async () => {
    if (!user || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const found = await loadViewerRace(user.id, puzzleKey, best, ownName);
      const solves = found?.solves.filter((s) => s.id === friendId || s.id === user.id) ?? [];
      if (!found || !solves.some((s) => s.id === friendId)) {
        setFailed(true);
        return;
      }
      setRace({ solves, letters: found.letters, own: found.own });
      track("race_action", { action: "watch-solve", signed_in: true });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const raceThem = async () => {
    saveRaceIntent({ key: puzzleKey, userIds: [friendId] });
    track("race_action", { action: "race-solve", signed_in: true });
    if ((await game.handleSoloPuzzleLoaded(puzzle)) === false) return;
    navigate("/solo/play");
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => void open()} disabled={busy} aria-busy={busy || undefined} aria-label={t("race.watchSolveOf", { name: friendName })} title={failed ? t("race.watchFailed") : undefined}>
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PlayCircle className="size-4" aria-hidden="true" />}
        {t(failed ? "race.watchRetry" : "race.watchSolve")}
      </Button>
      {race && (
        <Suspense fallback={null}>
          <FriendRaceDialog
            puzzle={puzzle}
            solves={race.solves}
            letters={race.letters}
            cta={race.own || typeof best === "number" ? undefined : { label: t("race.raceTheirSolve"), onClick: () => void raceThem() }}
            onClose={() => setRace(null)}
          />
        </Suspense>
      )}
    </>
  );
}
