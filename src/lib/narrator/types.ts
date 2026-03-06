import type { Puzzle } from "../../types/puzzle";
import type { Player } from "../../types/game";

export interface AgentGameEvent {
  type:
    | "GAME_STARTED"
    | "CLUE_COMPLETED"
    | "LEAD_CHANGE"
    | "PLAYER_LEFT"
    | "GAME_COMPLETED";
  data: Record<string, unknown>;
}

export type NarratorEngine = "elevenlabs-agent" | "openai-agent" | "claude" | null;

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
