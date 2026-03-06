import { useCallback, useEffect, useRef, useState } from "react";
import { createNarratorBackend } from "../lib/narrator/factory";
import { buildGameStartedEvent, buildGameCompletedEvent } from "../lib/narrator/events";
import type { NarratorBackend, AgentGameEvent, NarratorEngine } from "../lib/narrator/types";
import type { Puzzle } from "../types/puzzle";
import type { Player } from "../types/game";

interface UseNarratorOptions {
  narratorEngine: NarratorEngine;
  ttsEngine?: "browser" | "elevenlabs";
  enabled: boolean;
  gameStatus: "waiting" | "active" | "completed";
  players: Player[];
  puzzle: Puzzle | null;
  playerScores: { name: string; score: number }[];
}

interface UseNarratorResult {
  sendEvent: (event: AgentGameEvent) => void;
  isConnected: boolean;
  connectionError: string | null;
}

export function useNarrator({
  narratorEngine,
  ttsEngine,
  enabled,
  gameStatus,
  players,
  puzzle,
  playerScores,
}: UseNarratorOptions): UseNarratorResult {
  const narratorRef = useRef<NarratorBackend | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const gameCompletedSentRef = useRef(false);
  const activeEngineRef = useRef<NarratorEngine>(null);
  const activeTtsEngineRef = useRef<string | undefined>(undefined);

  // Stable ref for latest values
  const playersRef = useRef(players);
  playersRef.current = players;
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const playerScoresRef = useRef(playerScores);
  playerScoresRef.current = playerScores;

  function disconnectNarrator() {
    if (narratorRef.current) {
      narratorRef.current.setOnStateChange(null);
      narratorRef.current.disconnect();
      narratorRef.current = null;
      activeEngineRef.current = null;
      activeTtsEngineRef.current = undefined;
      setIsConnected(false);
    }
  }

  // Connect when enabled && game is active; reconnect when engine changes
  useEffect(() => {
    if (!enabled || !narratorEngine || gameStatus !== "active") return;

    // If engine or ttsEngine changed, disconnect the old one first
    if (
      narratorRef.current &&
      (activeEngineRef.current !== narratorEngine || activeTtsEngineRef.current !== ttsEngine)
    ) {
      disconnectNarrator();
    }

    // Already connected with the right config
    if (narratorRef.current) return;

    const narrator = createNarratorBackend(narratorEngine, { ttsEngine });
    if (!narrator) return;

    narratorRef.current = narrator;
    activeEngineRef.current = narratorEngine;
    activeTtsEngineRef.current = ttsEngine;
    gameCompletedSentRef.current = false;

    narrator.setOnStateChange(() => {
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
  }, [enabled, gameStatus, narratorEngine, ttsEngine]);

  // Send GAME_COMPLETED when game ends, then disconnect after narrator finishes speaking
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

    // Disconnect once the narrator finishes speaking the completion message
    narratorRef.current.setOnIdle(() => {
      disconnectNarrator();
    });

    narratorRef.current.sendEvent(buildGameCompletedEvent(winner, scores, totalClues));
  }, [gameStatus]);

  // Fix 3: Disconnect when gameStatus goes back to "waiting" (back to menu)
  useEffect(() => {
    if (gameStatus === "waiting" && narratorRef.current) {
      disconnectNarrator();
    }
  }, [gameStatus]);

  // Disconnect immediately when enabled → false (muted, engine changed, room closed)
  useEffect(() => {
    if (!enabled) {
      disconnectNarrator();
    }
  }, [enabled]);

  // Disconnect when narrator engine changes
  useEffect(() => {
    if (narratorRef.current && activeEngineRef.current !== narratorEngine) {
      disconnectNarrator();
    }
  }, [narratorEngine]);

  // Cleanup on unmount — always disconnect
  useEffect(() => {
    return () => {
      disconnectNarrator();
    };
  }, []);

  const sendEvent = useCallback((event: AgentGameEvent) => {
    narratorRef.current?.sendEvent(event);
  }, []);

  return { sendEvent, isConnected, connectionError };
}
