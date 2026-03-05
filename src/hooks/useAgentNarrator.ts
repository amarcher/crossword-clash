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
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameCompletedSentRef = useRef(false);

  // Stable ref for latest values
  const playersRef = useRef(players);
  playersRef.current = players;
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const playerScoresRef = useRef(playerScores);
  playerScoresRef.current = playerScores;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Connect when enabled && active (once per mount)
  useEffect(() => {
    if (!enabled || gameStatus !== "active") return;
    // Already have an active narrator — don't create another
    if (narratorRef.current) return;

    const narrator = new AgentNarrator();
    narratorRef.current = narrator;
    gameCompletedSentRef.current = false;

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

    // No cleanup here — we manage disconnect explicitly via
    // the gameStatus === "completed" and enabled === false effects below.
    // This prevents the effect re-running on gameStatus change from
    // tearing down the connection before GAME_COMPLETED can be sent.
  }, [enabled, gameStatus]);

  // Send GAME_COMPLETED and disconnect after delay
  useEffect(() => {
    if (gameStatus !== "completed") return;
    if (!narratorRef.current || gameCompletedSentRef.current) return;

    gameCompletedSentRef.current = true;
    const narrator = narratorRef.current;
    const scores = playerScoresRef.current;
    const p = puzzleRef.current;
    if (!p) return;

    const totalClues = p.clues.length;
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const winner = sorted[0]?.name ?? "Unknown";

    narrator.sendEvent(buildGameCompletedEvent(winner, scores, totalClues));

    // Give the agent time to speak the final announcement, then disconnect
    disconnectTimerRef.current = setTimeout(() => {
      disconnectNarrator();
    }, 15_000);

    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    };
  }, [gameStatus]);

  // Disconnect immediately when enabled → false (muted, engine changed, room closed)
  useEffect(() => {
    if (!enabled) {
      disconnectNarrator();
    }
  }, [enabled]);

  // Cleanup on unmount — always disconnect
  useEffect(() => {
    return () => {
      disconnectNarrator();
    };
  }, []);

  function disconnectNarrator() {
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    if (narratorRef.current) {
      narratorRef.current.setOnConnectionErrorChange(null);
      narratorRef.current.disconnect();
      narratorRef.current = null;
      setIsConnected(false);
    }
  }

  const sendEvent = useCallback((event: AgentGameEvent) => {
    narratorRef.current?.sendEvent(event);
  }, []);

  return { sendEvent, isConnected, connectionError };
}
