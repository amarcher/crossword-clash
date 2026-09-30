import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { useSupabase } from "../hooks/useSupabase";
import { useSpectatorRoom } from "../hooks/useSpectatorRoom";
import { CrosswordGrid } from "../components/CrosswordGrid";
import { TVCluePanel } from "../components/Layout/TVCluePanel";
import { TVJoinCard } from "../components/Layout/TVJoinCard";
import { TVLayout } from "../components/Layout/TVLayout";
import { TVScoreboard } from "../components/Layout/TVScoreboard";
import { TVScreen } from "../components/Layout/TVScreen";
import { buttonClass } from "../components/ui";
import { getCompletedClues } from "../lib/gridUtils";
import { formatDuration } from "../lib/soloStats";

const NOOP = () => {};
const EMPTY_HIGHLIGHTS = new Set<string>();

/** Separate from player/host layouts, including when opened in another tab on
 * the host's computer. Sharing an auth session must not grant display controls. */
export function SpectatorScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code: routeCode = "" } = useParams();
  const code = routeCode.toUpperCase();
  const [entry, setEntry] = useState(code);
  const { user, loading: authLoading } = useSupabase();
  const { room, loading, error } = useSpectatorRoom(code, !!user);
  if (!code || !room) {
    return (
      <TVScreen>
        <div className="max-w-[40em]">
          <h1 className="tv-t-2xl font-display font-bold text-white">{t("spectator.join")}</h1>
          <p className="tv-t-md mt-3 text-slate-300">{t("spectator.description")}</p>
        </div>
        <form
          className="w-full max-w-sm space-y-4 text-left"
          onSubmit={event => { event.preventDefault(); if (/^[A-Z0-9]{6}$/.test(entry)) navigate(`/watch/${entry}`); }}
        >
          <label htmlFor="watch-code" className="tv-t-md block font-semibold text-slate-200">{t("join.gameCode")}</label>
          <input
            id="watch-code"
            value={entry}
            onChange={event => setEntry(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} maxLength={6}
            placeholder="ABC123"
            className="w-full rounded-xl border border-stage-line bg-stage-raised p-3 text-center font-mono text-3xl font-bold tracking-widest text-gold-400 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          />
          <button disabled={entry.length !== 6 || !user} className={buttonClass("primary", "lg", "w-full")}>{t("spectator.join")}</button>
          {code && loading && user && <p role="status" className="text-slate-300">{t("playing.reconnecting")}</p>}
          {(error || (!authLoading && !user)) && <p role="alert" className="text-gold-400">{t("spectator.error")}</p>}
        </form>
        <Link className="tv-t-md inline-flex min-h-11 items-center text-slate-300 underline underline-offset-4 hover:text-white" to="/menu">{t("join.back")}</Link>
      </TVScreen>
    );
  }
  const { puzzle, state } = room;
  const total = puzzle.cells.flat().filter(cell => cell.solution !== null).length;
  const colors = Object.fromEntries(state.players.map(player => [player.userId, player.color]));
  const completedClues = getCompletedClues(puzzle, state.cells);
  const asyncRace = state.settings?.raceMode === "async";
  const joinUrl = `https://crosswordclash.com/?join=${code}`;
  const statusKey = state.status === "closed" ? "spectator.closed" : state.status === "waiting" ? "spectator.waiting" : state.status === "completed" ? "spectator.completed" : "spectator.live";
  return (
    <TVLayout
      grid={
        <CrosswordGrid puzzle={puzzle} playerCells={state.cells} selectedCell={null} highlightedCells={EMPTY_HIGHLIGHTS}
          onCellClick={NOOP} playerColorMap={colors} completedClues={completedClues} interactive={false} />
      }
      controls={
        <Link to="/watch" className={buttonClass("stage", "md", "tv-t-sm h-auto! py-2")}>
          <LogOut className="size-[1.3em]" aria-hidden />
          {t("spectator.leave")}
        </Link>
      }
      sidebar={<TVJoinCard code={code} joinUrl={joinUrl} />}
      scoreboard={
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <h1 className="tv-t-lg truncate font-display font-bold text-white">{puzzle.title}</h1>
              <p className="tv-t-sm text-slate-400">{t("spectator.display")}</p>
            </div>
            <p role="status" className="tv-t-sm shrink-0 rounded-full border border-stage-line bg-stage-raised px-3 py-1 font-semibold text-gold-400">{t(statusKey)}</p>
          </div>
          {error && <p role="alert" className="tv-t-sm text-gold-400">{t("spectator.reconnecting")}</p>}
          {asyncRace ? (
            <div className="tv-card" style={{ padding: "calc(var(--u) * 1.1)" }}>
              <h2 className="tv-t-md mb-2 font-display font-bold text-white">{t("spectator.race")}</h2>
              {state.players.slice().sort((a, b) => (a.raceSeconds ?? Infinity) - (b.raceSeconds ?? Infinity)).map(player => (
                <div key={player.userId} className="tv-t-md flex items-center justify-between gap-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: player.color }} aria-hidden />
                    <span className="truncate font-semibold text-white">{player.displayName}</span>
                  </span>
                  <span className="font-mono tabular-nums text-slate-300">{player.raceSeconds == null ? t("completion.solving") : formatDuration(player.raceSeconds)}</span>
                </div>
              ))}
            </div>
          ) : (
            <TVScoreboard players={state.players} totalCells={total} isComplete={state.status === "completed"} />
          )}
        </div>
      }
      clues={<TVCluePanel clues={puzzle.clues} completedClues={completedClues} />}
    />
  );
}
