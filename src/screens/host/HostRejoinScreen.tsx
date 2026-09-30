import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { TVScreen } from "../../components/Layout/TVScreen";
import { useHostContext } from "../../layouts/HostLayout";
import { loadHostSession, clearHostSession } from "../../lib/sessionPersistence";
import { rejoinGame } from "../../lib/puzzleService";

export function HostRejoinScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const host = useHostContext();

  useEffect(() => {
    if (!host.user) return;

    const session = loadHostSession();
    if (!session) {
      navigate("/host", { replace: true });
      return;
    }

    rejoinGame(session.gameId, host.user.id, "", { spectator: true }).then((result) => {
      if (!result) {
        clearHostSession();
        navigate("/host", { replace: true });
        return;
      }

      host.loadPuzzle(result.puzzle);
      if (result.cells && Object.keys(result.cells).length > 0) {
        const cellScore = Object.values(result.cells).filter((c: { correct: boolean }) => c.correct).length;
        host.dispatch({ type: "HYDRATE_CELLS", cells: result.cells, score: cellScore });
      }

      if (result.status === "waiting") {
        navigate(`/host/lobby/${result.gameId}`, { replace: true });
      } else {
        navigate(`/host/spectate/${result.gameId}`, { replace: true });
      }
    });
  }, [host, navigate]);

  return (
    <TVScreen>
      <p role="status" className="tv-t-lg flex items-center gap-3 text-slate-300">
        <Loader2 className="size-[1.2em] animate-spin motion-reduce:animate-none" aria-hidden />
        {t('playing.reconnecting')}
      </p>
    </TVScreen>
  );
}
