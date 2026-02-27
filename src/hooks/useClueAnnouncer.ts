import { useEffect, useRef } from "react";
import type { PuzzleClue } from "../types/puzzle";

interface Player {
  userId: string;
  displayName: string;
}

/**
 * Announces newly completed clues via the Web Speech API.
 * Skips announcements on initial mount (e.g. after hydration on rejoin)
 * so only live completions are spoken.
 */
export function useClueAnnouncer(
  completedCluesByPlayer: Map<string, { playerId: string }>,
  clues: PuzzleClue[],
  players: Player[],
) {
  const prevKeysRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // First run: seed with current state without announcing (handles rejoin hydration)
    if (prevKeysRef.current === null) {
      prevKeysRef.current = new Set(completedCluesByPlayer.keys());
      return;
    }

    const prevKeys = prevKeysRef.current;

    for (const [key, info] of completedCluesByPlayer) {
      if (prevKeys.has(key)) continue;

      const player = players.find((p) => p.userId === info.playerId);
      const playerName = player?.displayName ?? "Unknown";

      // key is "across-1" or "down-3"
      const dashIdx = key.indexOf("-");
      const direction = key.slice(0, dashIdx);
      const number = parseInt(key.slice(dashIdx + 1), 10);
      const clue = clues.find(
        (c) => c.direction === direction && c.number === number,
      );
      if (!clue) continue;

      const text = `${playerName} — ${number} ${direction} — ${clue.text} — ${clue.answer.toLowerCase()}`;
      const utterance = new SpeechSynthesisUtterance(text);
      speechSynthesis.speak(utterance);
    }

    prevKeysRef.current = new Set(completedCluesByPlayer.keys());
  }, [completedCluesByPlayer, clues, players]);
}
