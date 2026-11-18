import { useCallback } from "react";
import { PuzzleImporter } from "../components/PuzzleImporter";
import { useGame } from "../contexts/GameContext";
import type { Puzzle } from "../types/puzzle";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";

export function SoloImportScreen() {
  const navigate = useTransitionNavigate();
  const { handleSoloPuzzleLoaded } = useGame();

  const onPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      if (await handleSoloPuzzleLoaded(p, fileBuffer) === false) return;
      navigate("/solo/play");
    },
    [handleSoloPuzzleLoaded, navigate],
  );

  return <PuzzleImporter onPuzzleLoaded={onPuzzleLoaded} />;
}
