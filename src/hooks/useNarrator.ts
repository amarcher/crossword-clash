import { useCallback, useEffect, useRef, useState } from "react";
import { createNarratorBackend } from "../lib/narrator/factory";
import { buildGameStartedEvent, buildGameCompletedEvent } from "../lib/narrator/events";
import { ClaudeNarratorBackend } from "../lib/narrator/claudeNarrator";
import { NARRATOR_UNAVAILABLE, NARRATOR_UNAVAILABLE_ALLOWANCE, NARRATOR_UNAVAILABLE_BUDGET, NARRATOR_UNAVAILABLE_PLUS } from "../lib/narratorBudget";
import { sendNarratorSession } from "../lib/playInsightsClient";
import { puzzleIdentity } from "../lib/soloStats";
import { hasNarratorDemoRemaining } from "../lib/narratorDemo";
import type { NarratorBackend, AgentGameEvent, NarratorEngine } from "../lib/narrator/types";
import type { Puzzle } from "../types/puzzle";
import type { Player } from "../types/game";

interface UseNarratorOptions {
  narratorEngine: NarratorEngine;
  ttsEngine?: "browser" | "elevenlabs";
  voiceName?: string | null;
  rate?: number;
  pitch?: number;
  elevenLabsVoiceId?: string | null;
  enabled: boolean;
  gameStatus: "waiting" | "active" | "completed";
  /** Force-disconnect when the host closes the room mid-game. */
  isRoomClosed?: boolean;
  players: Player[];
  puzzle: Puzzle | null;
  /**
   * Per-player scores in the *same units* as the on-screen scoreboard
   * (cells claimed). The narrator events report `score/totalScore` so
   * the LLM, the scoreboard, and the DB players.score column all match.
   */
  playerScores: { name: string; score: number }[];
  totalScore: number;
  /** The room, for the narrator_sessions insight row. */
  gameId?: string | null;
}

interface UseNarratorResult {
  sendEvent: (event: AgentGameEvent) => void;
  isConnected: boolean;
  connectionError: string | null;
  /** Backend currently in use — may differ from settings if fallback cascaded. */
  currentEngine: NarratorEngine;
  /** Engine the user picked, surfaced for UIs that want to indicate fallback. */
  requestedEngine: NarratorEngine;
  /**
   * True when the owner's monthly budget cap is reached and any demo allowance
   * is spent: the narrator is intentionally paused (not a connection error).
   * Equivalent to `pausedReason === "budget"`.
   */
  budgetExhausted: boolean;
  /**
   * Why the narrator is intentionally paused, or null: the shared budget cap
   * ("budget"), the host is not a Plus subscriber and the free sample is spent
   * ("plus"), or a subscriber's monthly narrator minutes are used up
   * ("allowance"). None of these is a connection error, and none cascades.
   */
  pausedReason: NarratorPausedReason | null;
}

export type NarratorPausedReason = "budget" | "plus" | "allowance";

function pausedReasonOf(sentinel: string): NarratorPausedReason {
  if (sentinel.startsWith(NARRATOR_UNAVAILABLE_PLUS)) return "plus";
  if (sentinel.startsWith(NARRATOR_UNAVAILABLE_ALLOWANCE)) return "allowance";
  return "budget";
}

// Cheapest path first: on a connection failure we cascade toward the least
// costly backend so cost-favoring is preserved even during fallback.
const FALLBACK_CHAIN: Exclude<NarratorEngine, null>[] = [
  "claude",
  "elevenlabs-agent",
  "openai-agent",
];

export function useNarrator({
  narratorEngine,
  ttsEngine,
  voiceName,
  rate,
  pitch,
  elevenLabsVoiceId,
  enabled,
  gameStatus,
  isRoomClosed,
  players,
  puzzle,
  playerScores,
  totalScore,
  gameId = null,
}: UseNarratorOptions): UseNarratorResult {
  const narratorRef = useRef<NarratorBackend | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const gameCompletedSentRef = useRef(false);
  const activeEngineRef = useRef<NarratorEngine>(null);
  const activeTtsEngineRef = useRef<string | undefined>(undefined);

  // currentEngine starts at the user's pick but cascades through the
  // fallback chain on connection failure. Reset to the user's pick on
  // any explicit settings change.
  const [currentEngine, setCurrentEngine] = useState<NarratorEngine>(narratorEngine);
  const triedEnginesRef = useRef<Set<NarratorEngine>>(new Set());
  const [pausedReason, setPausedReason] = useState<NarratorPausedReason | null>(null);
  // Ensures the one-time "sample via Claude" demo switch happens at most once
  // per user selection, so budget exhaustion can never loop through backends.
  const budgetDemoTriedRef = useRef(false);

  useEffect(() => {
    setCurrentEngine(narratorEngine);
    triedEnginesRef.current = new Set();
    setConnectionError(null);
    setPausedReason(null);
    budgetDemoTriedRef.current = false;
  }, [narratorEngine]);

  // Cascade on connection error: pick next backend in FALLBACK_CHAIN.
  // When all backends have failed, settle on null and stop trying.
  useEffect(() => {
    if (!connectionError || !currentEngine) return;

    // Budget cap reached, Plus required, or a subscriber's minutes spent. Do
    // NOT cascade — every backend would hit the same ceiling. For the first
    // two, offer a one-time cheap sample via Claude (which owns the demo
    // allowance) if the user hasn't sampled yet and isn't already on it;
    // otherwise settle into the paused state with the reason.
    if (connectionError.startsWith(NARRATOR_UNAVAILABLE)) {
      const reason = pausedReasonOf(connectionError);
      setConnectionError(null);
      if (
        reason !== "allowance" &&
        !budgetDemoTriedRef.current &&
        currentEngine !== "claude" &&
        hasNarratorDemoRemaining()
      ) {
        budgetDemoTriedRef.current = true;
        setCurrentEngine("claude");
        return;
      }
      setPausedReason(reason);
      setCurrentEngine(null);
      return;
    }

    triedEnginesRef.current.add(currentEngine);
    const next = FALLBACK_CHAIN.find((e) => !triedEnginesRef.current.has(e));
    if (!next) {
      setCurrentEngine(null);
      return;
    }
    console.warn(`[useNarrator] ${currentEngine} failed, falling back to ${next}`);
    setCurrentEngine(next);
    setConnectionError(null);
  }, [connectionError, currentEngine]);

  // Stable ref for latest values
  const playersRef = useRef(players);
  playersRef.current = players;
  const puzzleRef = useRef(puzzle);
  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;
  const requestedEngineRef = useRef(narratorEngine);
  requestedEngineRef.current = narratorEngine;
  puzzleRef.current = puzzle;
  const playerScoresRef = useRef(playerScores);
  playerScoresRef.current = playerScores;
  const totalScoreRef = useRef(totalScore);
  totalScoreRef.current = totalScore;

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
    if (!enabled || !currentEngine || gameStatus !== "active") return;

    // If engine or ttsEngine changed, disconnect the old one first
    if (
      narratorRef.current &&
      (activeEngineRef.current !== currentEngine || activeTtsEngineRef.current !== ttsEngine)
    ) {
      console.log(`[useNarrator] Engine changed: ${activeEngineRef.current} → ${currentEngine}, reconnecting`);
      disconnectNarrator();
    }

    // Already connected with the right config
    if (narratorRef.current) return;

    const narrator = createNarratorBackend(currentEngine, { ttsEngine, voiceName, rate, pitch, elevenLabsVoiceId });
    if (!narrator) return;

    narratorRef.current = narrator;
    activeEngineRef.current = currentEngine;
    activeTtsEngineRef.current = ttsEngine;
    gameCompletedSentRef.current = false;

    narrator.setOnStateChange(() => {
      setConnectionError(narrator.connectionError);
      setIsConnected(narrator.isConnected);
    });

    narrator.connect().then(() => {
      setIsConnected(narrator.isConnected);
      setConnectionError(narrator.connectionError);
      // One insight row per start attempt: did the game-show host actually come on?
      const error = narrator.connectionError ?? "";
      sendNarratorSession({
        game_id: gameIdRef.current,
        puzzle_key: puzzleRef.current ? puzzleIdentity(puzzleRef.current) : "",
        puzzle_title: puzzleRef.current?.title ?? "",
        requested_engine: requestedEngineRef.current ?? "",
        engine: currentEngine ?? "",
        outcome: narrator.isConnected ? "connected" : error.startsWith(NARRATOR_UNAVAILABLE_BUDGET) ? "budget" : "failed",
        error: narrator.isConnected ? "" : error,
      });

      if (narrator.isConnected && puzzleRef.current) {
        narrator.sendEvent(
          buildGameStartedEvent(puzzleRef.current, playersRef.current),
        );
      }
    });
    // No cleanup — disconnect is managed by the effects below.
    // This prevents gameStatus changing from "active" → "completed"
    // from tearing down the connection before GAME_COMPLETED is sent.
  }, [enabled, gameStatus, currentEngine, ttsEngine]);

  // Sync voice settings to Claude narrator without reconnecting
  useEffect(() => {
    if (narratorRef.current instanceof ClaudeNarratorBackend) {
      narratorRef.current.setVoiceSettings({ voiceName, rate, pitch, elevenLabsVoiceId });
    }
  }, [voiceName, rate, pitch, elevenLabsVoiceId]);

  // Send GAME_COMPLETED when game ends, then disconnect after narrator finishes speaking
  useEffect(() => {
    if (gameStatus !== "completed") return;
    if (!narratorRef.current || gameCompletedSentRef.current) return;

    gameCompletedSentRef.current = true;
    const scores = playerScoresRef.current;
    const p = puzzleRef.current;
    if (!p) return;

    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const winner = sorted[0]?.name ?? "Unknown";

    // Disconnect once the narrator finishes speaking the completion message
    narratorRef.current.setOnIdle(() => {
      disconnectNarrator();
    });

    narratorRef.current.sendEvent(
      buildGameCompletedEvent(winner, scores, totalScoreRef.current),
    );
  }, [gameStatus]);

  // Fix 3: Disconnect when gameStatus goes back to "waiting" (back to menu)
  useEffect(() => {
    if (gameStatus === "waiting" && narratorRef.current) {
      disconnectNarrator();
    }
  }, [gameStatus]);

  // Disconnect immediately when host closes the room. gameStatus stays
  // "active" until HostLayout unmounts via navigate; without this hook
  // the narrator could speak briefly after the room is dead.
  useEffect(() => {
    if (isRoomClosed && narratorRef.current) {
      disconnectNarrator();
    }
  }, [isRoomClosed]);

  // Disconnect immediately when enabled → false (muted, engine changed, room closed)
  useEffect(() => {
    if (!enabled) {
      disconnectNarrator();
    }
  }, [enabled]);

  // Disconnect when the effective engine changes (user pick OR fallback cascade)
  useEffect(() => {
    if (narratorRef.current && activeEngineRef.current !== currentEngine) {
      disconnectNarrator();
    }
  }, [currentEngine]);

  // Cleanup on unmount — always disconnect
  useEffect(() => {
    return () => {
      disconnectNarrator();
    };
  }, []);

  const sendEvent = useCallback((event: AgentGameEvent) => {
    console.log(`[useNarrator] sendEvent: narrator=${!!narratorRef.current}, type=${event.type}`);
    narratorRef.current?.sendEvent(event);
  }, []);

  return {
    sendEvent,
    isConnected,
    connectionError,
    currentEngine,
    requestedEngine: narratorEngine,
    budgetExhausted: pausedReason === "budget",
    pausedReason,
  };
}
