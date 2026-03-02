import { useCallback } from "react";
import { useNavigate } from "react-router";
import { PuzzleImporter } from "../components/PuzzleImporter";
import { useGame } from "../contexts/GameContext";
import type { Puzzle } from "../types/puzzle";

export function SoloImportScreen() {
  const navigate = useNavigate();
  const { handleSoloPuzzleLoaded } = useGame();

  const onPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      await handleSoloPuzzleLoaded(p, fileBuffer);
      navigate("/solo/play");
    },
    [handleSoloPuzzleLoaded, navigate],
  );

  return <PuzzleImporter onPuzzleLoaded={onPuzzleLoaded} />;
}
