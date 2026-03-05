import { Conversation } from "@elevenlabs/client";
import { loadElevenLabsGate } from "./elevenLabsClient";
import type { Puzzle } from "../types/puzzle";
import type { Player } from "../types/game";

export interface AgentGameEvent {
  type:
    | "GAME_STARTED"
    | "CLUE_COMPLETED"
    | "LEAD_CHANGE"
    | "PLAYER_LEFT"
    | "GAME_COMPLETED";
  data: Record<string, unknown>;
}

function formatEvent(event: AgentGameEvent): string {
  const { type, data } = event;
  switch (type) {
    case "GAME_STARTED": {
      const playerNames = (data.playerNames as string[]).join(", ");
      return `GAME_STARTED: Players: ${playerNames}. Puzzle: '${data.title}' by ${data.author}. ${data.width}x${data.height} grid, ${data.acrossCount} across clues, ${data.downCount} down clues (${data.totalClues} total).`;
    }
    case "CLUE_COMPLETED": {
      const scores = data.scores as string;
      return `CLUE_COMPLETED: ${data.playerName} got ${data.clueNumber}-${data.clueDirection} '${data.clueText}' (${data.answer}). Scores: ${scores}. ${data.remaining} clues remaining.`;
    }
    case "LEAD_CHANGE": {
      return `LEAD_CHANGE: ${data.newLeader} takes the lead from ${data.previousLeader}! ${data.scores}`;
    }
    case "PLAYER_LEFT": {
      return `PLAYER_LEFT: ${data.playerName} has left the game.`;
    }
    case "GAME_COMPLETED": {
      return `GAME_COMPLETED: ${data.winner} wins! Final: ${data.scores}`;
    }
  }
}

async function fetchSignedUrl(): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const gate = loadElevenLabsGate();
  if (!supabaseUrl || !supabaseAnonKey || !gate) {
    throw new Error("Agent auth not configured");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/agent-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      "x-gate-token": gate.token,
    },
  });

  if (!res.ok) {
    throw new Error(`Agent auth failed: ${res.status}`);
  }

  const data = await res.json();
  return data.signed_url;
}

export function buildGameStartedEvent(
  puzzle: Puzzle,
  players: Player[],
): AgentGameEvent {
  const acrossCount = puzzle.clues.filter(
    (c) => c.direction === "across",
  ).length;
  const downCount = puzzle.clues.filter((c) => c.direction === "down").length;
  return {
    type: "GAME_STARTED",
    data: {
      playerNames: players.map((p) => p.displayName),
      title: puzzle.title,
      author: puzzle.author,
      width: puzzle.width,
      height: puzzle.height,
      acrossCount,
      downCount,
      totalClues: acrossCount + downCount,
    },
  };
}

export function buildClueCompletedEvent(
  playerName: string,
  clueNumber: number,
  clueDirection: string,
  clueText: string,
  answer: string,
  playerScores: { name: string; score: number }[],
  totalClues: number,
): AgentGameEvent {
  const scores = playerScores
    .map((p) => `${p.name} ${p.score}/${totalClues}`)
    .join(", ");
  const totalCompleted = playerScores.reduce((sum, p) => sum + p.score, 0);
  return {
    type: "CLUE_COMPLETED",
    data: {
      playerName,
      clueNumber,
      clueDirection,
      clueText,
      answer: answer.toLowerCase(),
      scores,
      remaining: totalClues - totalCompleted,
    },
  };
}

export function buildLeadChangeEvent(
  newLeader: string,
  previousLeader: string,
  playerScores: { name: string; score: number }[],
  totalClues: number,
): AgentGameEvent {
  const scores = playerScores
    .map((p) => `${p.name} ${p.score}/${totalClues}`)
    .join(", ");
  return {
    type: "LEAD_CHANGE",
    data: { newLeader, previousLeader, scores },
  };
}

export function buildGameCompletedEvent(
  winner: string,
  playerScores: { name: string; score: number }[],
  totalClues: number,
): AgentGameEvent {
  const scores = playerScores
    .map((p) => `${p.name} ${p.score}/${totalClues}`)
    .join(", ");
  return {
    type: "GAME_COMPLETED",
    data: { winner, scores },
  };
}

export class AgentNarrator {
  private conversation: Conversation | null = null;
  private eventQueue: AgentGameEvent[] = [];
  private connecting = false;
  private reconnectAttempted = false;
  private intentionalDisconnect = false;
  private _connectionError: string | null = null;
  private onConnectionErrorChange: (() => void) | null = null;

  get isConnected(): boolean {
    return this.conversation !== null;
  }

  get connectionError(): string | null {
    return this._connectionError;
  }

  async connect(): Promise<void> {
    if (this.conversation || this.connecting) return;
    this.connecting = true;
    this.intentionalDisconnect = false;
    this._connectionError = null;
    this.onConnectionErrorChange?.();

    try {
      const signedUrl = await fetchSignedUrl();

      this.conversation = await Conversation.startSession({
        signedUrl,
        onDisconnect: () => {
          this.conversation = null;
          // Don't reconnect if we intentionally disconnected
          if (this.intentionalDisconnect) return;
          if (!this.reconnectAttempted) {
            this.reconnectAttempted = true;
            this.connect().catch(() => {
              this._connectionError = "Agent disconnected";
              this.onConnectionErrorChange?.();
            });
          } else {
            this._connectionError = "Agent disconnected";
            this.onConnectionErrorChange?.();
          }
        },
        onError: (message) => {
          console.error("[AgentNarrator] Error:", message);
        },
      });

      // Immediately mute mic — we only send text input
      await this.conversation.setVolume({ volume: 1 });

      // Flush queued events
      for (const event of this.eventQueue) {
        this.conversation.sendUserMessage(formatEvent(event));
      }
      this.eventQueue = [];
    } catch (err) {
      this._connectionError =
        err instanceof Error ? err.message : "Connection failed";
      this.onConnectionErrorChange?.();
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.connecting = false;
    this.reconnectAttempted = false;
    if (this.conversation) {
      try {
        await this.conversation.endSession();
      } catch {
        // Ignore errors during teardown
      }
      this.conversation = null;
    }
    this.eventQueue = [];
  }

  sendEvent(event: AgentGameEvent): void {
    const text = formatEvent(event);
    console.log("[AgentNarrator] Sending:", text);
    if (!this.conversation) {
      this.eventQueue.push(event);
      return;
    }
    this.conversation.sendUserMessage(text);
  }

  setVolume(volume: number): void {
    this.conversation?.setVolume({ volume });
  }

  setOnConnectionErrorChange(cb: (() => void) | null): void {
    this.onConnectionErrorChange = cb;
  }
}
