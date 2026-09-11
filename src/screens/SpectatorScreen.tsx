import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { useSupabase } from "../hooks/useSupabase";
import { useSpectatorRoom } from "../hooks/useSpectatorRoom";
import { CrosswordGrid } from "../components/CrosswordGrid";
import { CluePanel } from "../components/CluePanel";
import { MultiplayerScoreboard } from "../components/Scoreboard/MultiplayerScoreboard";
import { Title } from "../components/Title";
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
      <div className="min-h-dvh bg-neutral-900 text-white flex flex-col items-center justify-center p-6">
        <Title variant="dark" />
        <h1 className="text-2xl font-bold mt-6">{t("spectator.join")}</h1>
        <p className="text-neutral-300 text-center max-w-md mt-2">{t("spectator.description")}</p>
        <form className="w-full max-w-sm space-y-4 mt-6" onSubmit={event => { event.preventDefault(); if (/^[A-Z0-9]{6}$/.test(entry)) navigate(`/watch/${entry}`); }}>
          <label htmlFor="watch-code" className="block">{t("join.gameCode")}</label>
          <input id="watch-code" value={entry} onChange={event => setEntry(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} maxLength={6}
            placeholder="ABC123" className="w-full rounded-lg border border-neutral-500 bg-neutral-800 p-3 text-center text-3xl tracking-widest font-mono" />
          <button disabled={entry.length !== 6 || !user} className="w-full bg-blue-600 rounded-lg py-3 font-semibold disabled:opacity-40">{t("spectator.join")}</button>
          {code && loading && user && <p role="status">{t("playing.reconnecting")}</p>}
          {(error || (!authLoading && !user)) && <p role="alert" className="text-amber-200">{t("spectator.error")}</p>}
        </form>
        <Link className="mt-6 text-neutral-300 underline" to="/menu">{t("join.back")}</Link>
      </div>
    );
  }
  const { puzzle, state } = room;
  const total = puzzle.cells.flat().filter(cell => cell.solution !== null).length;
  const colors = Object.fromEntries(state.players.map(player => [player.userId, player.color]));
  const completedClues = getCompletedClues(puzzle, state.cells);
  const asyncRace = state.settings?.raceMode === "async";
  const joinUrl = `https://crosswordclash.com/?join=${code}`;
  return (
    <div className="spectator-layout bg-neutral-900 text-white">
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0"><h1 className="font-bold text-xl truncate">{puzzle.title}</h1><p className="text-sm text-neutral-400">{t("spectator.display")}</p></div>
        <Link to="/watch" className="shrink-0 text-sm text-neutral-300 underline">{t("spectator.leave")}</Link>
      </header>
      <div className="spectator-body">
        <div className="native-grid-slot">
          <CrosswordGrid puzzle={puzzle} playerCells={state.cells} selectedCell={null} highlightedCells={EMPTY_HIGHLIGHTS}
            onCellClick={NOOP} playerColorMap={colors} completedClues={completedClues} interactive={false} />
        </div>
        <aside className="spectator-sidebar">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm text-neutral-400">{t("hostView.roomCode")}</p><p className="font-mono text-4xl tracking-widest font-bold">{code}</p></div>
            <div className="bg-white p-2 rounded"><QRCode value={joinUrl} size={76} title={t("lobby.qrCodeLabel")} /></div>
          </div>
          <p role="status" className="rounded bg-neutral-800 p-3 text-sm">{t(state.status === "closed" ? "spectator.closed" : state.status === "waiting" ? "spectator.waiting" : state.status === "completed" ? "spectator.completed" : "spectator.live")}</p>
          {error && <p role="alert" className="text-amber-200 text-sm">{t("spectator.reconnecting")}</p>}
          <div className="rounded-xl bg-white p-4 text-neutral-900">
            {asyncRace ? <>
              <h2 className="font-bold mb-2">{t("spectator.race")}</h2>
              {state.players.slice().sort((a, b) => (a.raceSeconds ?? Infinity) - (b.raceSeconds ?? Infinity)).map(player => <div key={player.userId} className="flex justify-between gap-2 py-1"><span>{player.displayName}</span><span>{player.raceSeconds == null ? t("completion.solving") : formatDuration(player.raceSeconds)}</span></div>)}
            </> : <MultiplayerScoreboard players={state.players} totalCells={total} isComplete={state.status === "completed"} />}
          </div>
          <div className="spectator-clues rounded-xl bg-white text-neutral-900 p-4">
            <CluePanel clues={puzzle.clues} activeClue={null} onClueClick={NOOP} completedClues={completedClues} />
          </div>
        </aside>
      </div>
    </div>
  );
}
