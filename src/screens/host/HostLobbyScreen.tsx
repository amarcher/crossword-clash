import { useMemo } from "react";
import { Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import QRCode from "react-qr-code";
import { TVBrand } from "../../components/Layout/TVBrand";
import { TVSegmented } from "../../components/Layout/TVSegmented";
import { buttonClass, MiniGridThumb } from "../../components/ui";
import { useRoomSolves } from "../../hooks/useRoomSolves";
import { priorSolveChip } from "../../lib/roomSolves";
import { puzzleIdentity } from "../../lib/soloStats";
import { useBeforeUnload } from "../../hooks/useBeforeUnload";
import { useKeepAwake } from "../../lib/keepAwake";
import { useHostContext } from "../../layouts/HostLayout";
import { WRONG_ANSWER_TIMEOUT_OPTIONS } from "../../lib/gameSettings";

export function HostLobbyScreen() {
  const { t } = useTranslation();
  const host = useHostContext();
  const { multiplayer, joinUrl, wrongAnswerTimeout, setWrongAnswerTimeout, handleStartGame, handleCloseRoom } = host;

  useBeforeUnload(true);
  // A shared screen nobody touches: keep it from dimming while players join.
  useKeepAwake(true);

  // Who in the room has finished this puzzle before (room_solves): a chip on their row (Andrew, 2026-11-03).
  const playerIds = useMemo(() => multiplayer.players.map((p) => p.userId), [multiplayer.players]);
  const solves = useRoomSolves(host.user?.id, host.gameId, host.puzzle ? puzzleIdentity(host.puzzle) : null, playerIds);

  if (!host.puzzle) return <Navigate to="/host" replace />;

  const playerCount = multiplayer.players.length;
  const canStart = playerCount >= 2;
  const acrossCount = host.puzzle.clues.filter((c) => c.direction === "across").length;
  const downCount = host.puzzle.clues.filter((c) => c.direction === "down").length;

  return (
    <div className="tv-stage">
      <div className="tv-lobby">
        {/* Join column */}
        <section className="tv-card tv-lobby-join flex min-h-0 flex-col items-center justify-between text-center" style={{ padding: "calc(var(--u) * 2)" }}>
          <TVBrand height="calc(var(--u) * 5.5)" />

          <div className="flex flex-col items-center" style={{ gap: "calc(var(--u) * 1.2)" }}>
            <p className="tv-t-md font-semibold uppercase tracking-[0.16em] text-brand-200">{t("hostView.roomCode")}</p>
            <p data-testid="room-code" className="tv-code font-mono font-bold tabular-nums text-gold-400">
              {multiplayer.shareCode ?? "······"}
            </p>
            <p className="tv-t-xl font-display font-bold text-white">{t("tv.joinAt")}</p>
          </div>

          {joinUrl ? (
            <div className="flex flex-col items-center" style={{ gap: "calc(var(--u) * 0.8)" }}>
              <div
                className="rounded-2xl bg-white shadow-overlay"
                style={{ padding: "calc(var(--u) * 1)", width: "min(calc(var(--u) * 17), 34dvh)", height: "min(calc(var(--u) * 17), 34dvh)" }}
              >
                <QRCode value={joinUrl} title={t("lobby.qrCodeLabel")} style={{ width: "100%", height: "100%" }} />
              </div>
              <p className="tv-t-md text-slate-300">{t("tv.orScan")}</p>
            </div>
          ) : (
            <div />
          )}
        </section>

        {/* Players + controls column */}
        <section className="flex min-h-0 flex-col" style={{ gap: "calc(var(--u) * 1.4)" }}>
          <header>
            <h1 className="tv-t-2xl font-display font-bold leading-tight text-white">{t("lobby.waitingForPlayersTitle")}</h1>
          </header>

          {/* The puzzle about to be solved, featured (Andrew, 2026-11-03: the lobby showed only its name in small type). */}
          <section aria-label={t("lobby.puzzleHeading")} className="tv-card flex shrink-0 items-center" style={{ gap: "calc(var(--u) * 1.2)", padding: "calc(var(--u) * 1.2)" }}>
            <span className="shrink-0 rounded-xl bg-white p-1.5 shadow-raised">
              <MiniGridThumb puzzle={host.puzzle} style={{ width: "calc(var(--u) * 7)" }} />
            </span>
            <span className="min-w-0">
              <span className="tv-t-sm block font-semibold uppercase tracking-[0.12em] text-slate-400">{t("lobby.puzzleHeading")}</span>
              <span className="tv-t-xl block truncate font-display font-bold leading-tight text-white">{host.puzzle.title}</span>
              <span className="tv-t-md mt-1 block truncate text-slate-300">
                {t("puzzleReady.dimensions", { width: host.puzzle.width, height: host.puzzle.height, acrossCount, downCount })}
                {host.puzzle.author ? ` · ${t("puzzleReady.by", { author: host.puzzle.author })}` : ""}
              </span>
            </span>
          </section>

          <div className="tv-card flex min-h-0 flex-1 flex-col" style={{ padding: "calc(var(--u) * 1.4)" }}>
            <h2 className="tv-t-sm mb-3 font-semibold uppercase tracking-[0.12em] text-slate-400">
              {t("lobby.players", { count: playerCount })}
            </h2>
            {playerCount === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div className="flex gap-3" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="tv-pulse size-4 rounded-full bg-brand-500" style={{ animationDelay: `${i * 200}ms` }} />
                  ))}
                </div>
                <p role="status" className="tv-t-lg text-slate-300">{t("lobby.waitingForPlayers")}</p>
              </div>
            ) : (
              <ul className="tv-clue-list grid min-h-0 flex-1 auto-rows-min grid-cols-1 content-start gap-3 overflow-y-auto min-[1100px]:grid-cols-2">
                {multiplayer.players.map((player) => (
                  <li
                    key={player.userId}
                    className="tv-pop flex items-center gap-4 rounded-xl border border-stage-line bg-stage px-5 py-3"
                  >
                    <span className="size-5 shrink-0 rounded-full" style={{ backgroundColor: player.color }} aria-hidden />
                    <span className="tv-t-xl min-w-0 flex-1 truncate font-display font-semibold text-white">{player.displayName}</span>
                    {priorSolveChip(solves[player.userId]) === "solved" && (
                      <span className="tv-t-sm shrink-0 rounded-full bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-200">{t("lobby.solvedBefore")}</span>
                    )}
                    {priorSolveChip(solves[player.userId]) === "raced" && (
                      <span className="tv-t-sm shrink-0 rounded-full bg-brand-500/25 px-3 py-1 font-semibold text-brand-100">{t("lobby.racedBefore")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="tv-card shrink-0" style={{ padding: "calc(var(--u) * 1.4)" }}>
            <TVSegmented
              label={t("timeout.wrongAnswerPenalty")}
              value={wrongAnswerTimeout}
              onChange={setWrongAnswerTimeout}
              options={WRONG_ANSWER_TIMEOUT_OPTIONS.map((o) => ({ value: o.value, label: o.value === 0 ? t("timeout.off") : o.label }))}
            />
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={handleStartGame}
              disabled={!canStart}
              className={buttonClass("primary", "lg", "tv-t-lg h-auto! min-h-14 flex-1 py-4")}
            >
              <Play className="size-[1.1em]" aria-hidden />
              {t("lobby.startGame")}
            </button>
            <button type="button" onClick={handleCloseRoom} className={buttonClass("stage", "lg", "tv-t-md h-auto! min-h-14 py-4")}>
              <X className="size-[1.1em]" aria-hidden />
              {t("lobby.closeRoom")}
            </button>
          </div>
          {!canStart && (
            <p className="tv-t-md -mt-2 shrink-0 text-center text-slate-400">{t("lobby.needMorePlayers", { count: 2 - playerCount })}</p>
          )}
        </section>
      </div>
    </div>
  );
}
