interface ScoreboardProps {
  score: number;
  totalCells: number;
  isComplete: boolean;
}

export function Scoreboard({ score, totalCells, isComplete }: ScoreboardProps) {
  const pct = totalCells > 0 ? Math.round((score / totalCells) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">
          {score}/{totalCells} cells
        </span>
        <span className="text-neutral-400">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {isComplete && (
        <div className="text-center py-3 px-4 rounded-lg bg-green-50 border border-green-200">
          <p className="text-green-700 font-bold text-lg">Puzzle Complete!</p>
        </div>
      )}
    </div>
  );
}
