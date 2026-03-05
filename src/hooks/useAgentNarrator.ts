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
  const gameCompletedSentRef = useRef(false);

  // Stable ref for latest values
  const playersRef = useRef(players);
  playersRef.current = players;
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const playerScoresRef = useRef(playerScores);
  playerScoresRef.current = playerScores;

  // Connect when enabled && game is active (once per session)
  useEffect(() => {
    if (!enabled || gameStatus !== "active") return;
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

      if (narrator.isConnected && puzzleRef.current) {
        narrator.sendEvent(
          buildGameStartedEvent(puzzleRef.current, playersRef.current),
        );
      }
    });
    // No cleanup — disconnect is managed by the effects below.
    // This prevents gameStatus changing from "active" → "completed"
    // from tearing down the connection before GAME_COMPLETED is sent.
  }, [enabled, gameStatus]);

  // Send GAME_COMPLETED when game ends (but keep connection alive for agent to react)
  useEffect(() => {
    if (gameStatus !== "completed") return;
    if (!narratorRef.current || gameCompletedSentRef.current) return;

    gameCompletedSentRef.current = true;
    const scores = playerScoresRef.current;
    const p = puzzleRef.current;
    if (!p) return;

    const totalClues = p.clues.length;
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const winner = sorted[0]?.name ?? "Unknown";

    narratorRef.current.sendEvent(buildGameCompletedEvent(winner, scores, totalClues));
    // Connection stays alive — the idle timer in AgentNarrator will
    // auto-disconnect after the agent finishes speaking and goes quiet.
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
