import type { Puzzle } from "../../types/puzzle";
import type { Player } from "../../types/game";

export interface AgentGameEvent {
  type:
    | "GAME_STARTED"
    | "CLUE_COMPLETED"
    | "LEAD_CHANGE"
    | "PLAYER_LEFT"
    | "GAME_COMPLETED"
    | "WRONG_LETTER"
    | "NEAR_MISS"
    | "STALL";
  data: Record<string, unknown>;
}

/**
 * One AI host (Andrew, 2026-11-14: "we expose too many different ways to
 * have an AI host. I think we need to just settle on one"): Claude writes the
 * line and a voice speaks it. The two realtime agents (ElevenLabs, OpenAI)
 * are gone from the client; a stored choice of either reads as "claude".
 */
export type NarratorEngine = "claude" | null;

export interface NarratorBackend {
  readonly name: string;
  readonly isConnected: boolean;
  readonly connectionError: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendEvent(event: AgentGameEvent): void;
  setVolume(volume: number): void;
  setOnStateChange(cb: (() => void) | null): void;
  /** Called once when the narrator finishes speaking and has no pending events. */
  setOnIdle(cb: (() => void) | null): void;
}

export type { Puzzle, Player };
