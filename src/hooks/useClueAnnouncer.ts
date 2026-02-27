import { useEffect, useRef } from "react";
import type { CellState, PuzzleClue } from "../types/puzzle";

interface Player {
  userId: string;
  displayName: string;
}

/** Return the cell keys for a clue's word */
function getClueWordKeys(clue: PuzzleClue): string[] {
  const keys: string[] = [];
  for (let i = 0; i < clue.length; i++) {
    const r = clue.direction === "down" ? clue.row + i : clue.row;
    const c = clue.direction === "across" ? clue.col + i : clue.col;
    keys.push(`${r},${c}`);
  }
  return keys;
}

/**
 * Announces newly completed clues via the Web Speech API.
 * Skips announcements on initial mount (e.g. after hydration on rejoin)
 * so only live completions are spoken.
 *
 * Credits the player who placed the final cell that completed the word
 * (by diffing previous vs current playerCells), not the last positional cell.
 */
export function useClueAnnouncer(
  completedCluesByPlayer: Map<string, { playerId: string }>,
  clues: PuzzleClue[],
  players: Player[],
  playerCells: Record<string, CellState>,
) {
  const prevKeysRef = useRef<Set<string> | null>(null);
  const prevCellsRef = useRef<Record<string, CellState>>({});

  useEffect(() => {
    // First run: seed with current state without announcing (handles rejoin hydration)
    if (prevKeysRef.current === null) {
      prevKeysRef.current = new Set(completedCluesByPlayer.keys());
      prevCellsRef.current = playerCells;
      return;
    }

    const prevKeys = prevKeysRef.current;
    const prevCells = prevCellsRef.current;

    for (const [key] of completedCluesByPlayer) {
      if (prevKeys.has(key)) continue;

      // key is "across-1" or "down-3"
      const dashIdx = key.indexOf("-");
      const direction = key.slice(0, dashIdx);
      const number = parseInt(key.slice(dashIdx + 1), 10);
      const clue = clues.find(
        (c) => c.direction === direction && c.number === number,
      );
      if (!clue) continue;

      // Find the cell that was just added (not in prev state) — that's the completing player
      let completingPlayerId: string | undefined;
      for (const cellKey of getClueWordKeys(clue)) {
        const cur = playerCells[cellKey];
        const prev = prevCells[cellKey];
        if (cur?.correct && !prev?.correct) {
          completingPlayerId = cur.playerId;
          break;
        }
      }

      const player = players.find((p) => p.userId === completingPlayerId);
      const playerName = player?.displayName ?? "Unknown";

      const text = `${playerName} — ${number} ${direction} — ${clue.text} — ${clue.answer.toLowerCase()}`;
      const utterance = new SpeechSynthesisUtterance(text);
      speechSynthesis.speak(utterance);
    }

    prevKeysRef.current = new Set(completedCluesByPlayer.keys());
    prevCellsRef.current = playerCells;
  }, [completedCluesByPlayer, clues, players, playerCells]);
}
