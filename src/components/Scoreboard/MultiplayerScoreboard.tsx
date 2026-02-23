import type { Player } from "../../types/game";

interface MultiplayerScoreboardProps {
  players: Player[];
  totalCells: number;
  isComplete: boolean;
}

export function MultiplayerScoreboard({
  players,
  totalCells,
  isComplete,
}: MultiplayerScoreboardProps) {
  const totalScore = players.reduce((sum, p) => sum + p.score, 0);
  const totalPct = totalCells > 0 ? Math.round((totalScore / totalCells) * 100) : 0;

  const ranked = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-500">
            {totalScore}/{totalCells} cells
          </span>
          <span className="text-neutral-400">{totalPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden flex">
          {players.map((player) => {
            const pct = totalCells > 0 ? (player.score / totalCells) * 100 : 0;
            return (
              <div
                key={player.userId}
                className="h-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: player.color,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        {ranked.map((player, i) => {
          const pct = totalCells > 0 ? Math.round((player.score / totalCells) * 100) : 0;
          return (
            <div key={player.userId} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: player.color }}
              />
              <span className="text-xs font-medium text-neutral-700 flex-1 truncate">
                {isComplete && i === 0 && ranked[0].score > (ranked[1]?.score ?? 0) ? "🏆 " : ""}
                {player.displayName}
              </span>
              <span className="text-xs text-neutral-400 tabular-nums">
                {player.score} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>

      {isComplete && (
        <div className="text-center py-3 px-4 rounded-lg bg-green-50 border border-green-200">
          <p className="text-green-700 font-bold text-lg">Puzzle Complete!</p>
          {ranked.length > 1 && ranked[0].score > ranked[1].score && (
            <p className="text-green-600 text-sm mt-1">
              {ranked[0].displayName} wins!
            </p>
          )}
          {ranked.length > 1 && ranked[0].score === ranked[1].score && (
            <p className="text-green-600 text-sm mt-1">It&apos;s a tie!</p>
          )}
        </div>
      )}
    </div>
  );
}
