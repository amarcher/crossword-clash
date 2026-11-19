import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { PuzzleImporter } from "../components/PuzzleImporter";
import { useGame } from "../contexts/GameContext";
import type { Puzzle } from "../types/puzzle";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { pickIntent, usePickPuzzle } from "../hooks/usePickPuzzle";

export function SoloImportScreen() {
  const navigate = useTransitionNavigate();
  const { handleSoloPuzzleLoaded } = useGame();
  // Picking for a room (`?pick=`, from the room's puzzle picker): the file becomes the room's puzzle.
  const [params] = useSearchParams();
  const pick = pickIntent(params);
  const { choose } = usePickPuzzle(pick ?? "race");

  const onPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      if (pick) {
        await choose(p, "import");
        return;
      }
      if (await handleSoloPuzzleLoaded(p, fileBuffer) === false) return;
      navigate("/solo/play");
    },
    [handleSoloPuzzleLoaded, navigate, pick, choose],
  );

  return <PuzzleImporter onPuzzleLoaded={onPuzzleLoaded} />;
}
