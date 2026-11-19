import { useTranslation } from "react-i18next";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "./ui";
import type { BoardJoin } from "../hooks/useBoardJoin";

/**
 * The way onto the board for a finish that is not on it (useBoardJoin): make
 * an account, or choose who may watch your solves. Being on the board and
 * being watchable are one choice, so the two buttons are the choice.
 */
export function BoardJoinPrompt({ join, darkMode, className = "" }: { join: BoardJoin; darkMode?: boolean; className?: string }) {
  const { t } = useTranslation();
  if (join.kind === "account") {
    return (
      <div data-testid="board-join" className={className}>
        <Button variant="secondary" size="lg" block onClick={join.onCreate}>
          <Trophy className="size-4 shrink-0" aria-hidden="true" />
          {t("boardJoin.create")}
        </Button>
      </div>
    );
  }
  return (
    <div data-testid="board-join" role="group" aria-labelledby="board-join-title" className={`text-center ${className}`}>
      <p id="board-join-title" className={`text-sm font-semibold ${darkMode ? "text-white" : "text-ink"}`}>{t("boardJoin.title")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => join.onChoose("everyone")} disabled={join.busy} aria-busy={join.busy || undefined}>
          {join.busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {t("boardJoin.everyone")}
        </Button>
        <Button variant="secondary" onClick={() => join.onChoose("friends")} disabled={join.busy}>
          {t("boardJoin.friends")}
        </Button>
      </div>
      {join.failed && <p role="alert" className="mt-2 text-sm text-red-700">{t("ghostRace.visibilitySaveFailed")}</p>}
    </div>
  );
}
