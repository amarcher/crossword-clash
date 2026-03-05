import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentNarrator,
  buildGameStartedEvent,
  buildGameCompletedEvent,
} from "../lib/agentClient";
import type { AgentGameEvent } from "../lib/agentClient";
import type { Puzzle } from "../types/puzzle";
import type { Player } from "../types/game";

interface UseAgentNarratorOptions {
  enabled: boolean;
  gameStatus: "waiting" | "active" | "completed";
  players: Player[];
  puzzle: Puzzle | null;
  playerScores: { name: string; score: number }[];
}

interface UseAgentNarratorResult {
  sendEvent: (event: AgentGameEvent) => void;
  isConnected: boolean;
  connectionError: string | null;
}

export function useAgentNarrator({
  enabled,
  gameStatus,
  players,
  puzzle,
  playerScores,
}: UseAgentNarratorOptions): UseAgentNarratorResult {
  const narratorRef = useRef<AgentNarrator | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const hasConnectedRef = useRef(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref for latest values
  const playersRef = useRef(players);
  playersRef.current = players;
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const playerScoresRef = useRef(playerScores);
  playerScoresRef.current = playerScores;

  // Connect when enabled && active
  useEffect(() => {
    if (!enabled || gameStatus !== "active") return;
    if (hasConnectedRef.current) return;

    const narrator = new AgentNarrator();
    narratorRef.current = narrator;
    hasConnectedRef.current = true;

    narrator.setOnConnectionErrorChange(() => {
      setConnectionError(narrator.connectionError);
      setIsConnected(narrator.isConnected);
    });

    narrator.connect().then(() => {
      setIsConnected(narrator.isConnected);
      setConnectionError(narrator.connectionError);

      // Send GAME_STARTED on connect
      if (narrator.isConnected && puzzleRef.current) {
        narrator.sendEvent(
          buildGameStartedEvent(puzzleRef.current, playersRef.current),
        );
      }
    });

    return () => {
      narrator.setOnConnectionErrorChange(null);
      narrator.disconnect();
      narratorRef.current = null;
      hasConnectedRef.current = false;
    };
  }, [enabled, gameStatus]);

  // Send GAME_COMPLETED and disconnect after delay
  useEffect(() => {
    if (gameStatus !== "completed" || !narratorRef.current) return;

    const narrator = narratorRef.current;
    const scores = playerScoresRef.current;
    const puzzle = puzzleRef.current;
    if (!puzzle) return;

    const totalClues = puzzle.clues.length;
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const winner = sorted[0]?.name ?? "Unknown";

    narrator.sendEvent(buildGameCompletedEvent(winner, scores, totalClues));

    disconnectTimerRef.current = setTimeout(() => {
      narrator.disconnect();
      setIsConnected(false);
    }, 10_000);

    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
      }
    };
  }, [gameStatus]);

  // Cleanup on enabled → false
  useEffect(() => {
    if (!enabled && narratorRef.current) {
      narratorRef.current.disconnect();
      narratorRef.current = null;
      hasConnectedRef.current = false;
      setIsConnected(false);
    }
  }, [enabled]);

  const sendEvent = useCallback((event: AgentGameEvent) => {
    narratorRef.current?.sendEvent(event);
  }, []);

  return { sendEvent, isConnected, connectionError };
}
