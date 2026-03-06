import { Conversation } from "@elevenlabs/client";
import { loadElevenLabsGate } from "../elevenLabsClient";
import { formatEvent } from "./events";
import type { NarratorBackend, AgentGameEvent } from "./types";

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

/** How long after the agent finishes speaking before we auto-disconnect (ms) */
const IDLE_DISCONNECT_MS = 30_000;

/** How long of silence in listening mode before we send a contextual reminder (ms) */
const QUIET_REMINDER_MS = 10_000;

export class ElevenLabsAgentBackend implements NarratorBackend {
  readonly name = "elevenlabs-agent";
  private conversation: Conversation | null = null;
  private eventQueue: AgentGameEvent[] = [];
  private connecting = false;
  private reconnectAttempted = false;
  private intentionalDisconnect = false;
  private _connectionError: string | null = null;
  private onStateChange: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private quietReminderTimer: ReturnType<typeof setTimeout> | null = null;
  private hasPendingEvents = false;
  private agentMode: "speaking" | "listening" = "listening";
  private pendingContextUpdates: AgentGameEvent[] = [];

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
    this.onStateChange?.();

    try {
      const signedUrl = await fetchSignedUrl();

      this.conversation = await Conversation.startSession({
        signedUrl,
        onDisconnect: () => {
          this.conversation = null;
          this.clearIdleTimer();
          this.clearQuietReminderTimer();
          if (this.intentionalDisconnect) return;
          if (!this.reconnectAttempted) {
            this.reconnectAttempted = true;
            this.connect().catch(() => {
              this._connectionError = "Agent disconnected";
              this.onStateChange?.();
            });
          } else {
            this._connectionError = "Agent disconnected";
            this.onStateChange?.();
          }
        },
        onModeChange: (mode) => {
          if (mode.mode === "listening") {
            this.agentMode = "listening";

            // If we accumulated context updates while agent was speaking,
            // prompt the agent to address them now
            if (this.pendingContextUpdates.length > 0) {
              this.pendingContextUpdates = [];
              this.hasPendingEvents = true;
              this.clearIdleTimer();
              this.clearQuietReminderTimer();
              this.conversation?.sendUserMessage(
                "Please comment on the recent events.",
              );
            } else if (!this.hasPendingEvents) {
              this.resetIdleTimer();
              this.resetQuietReminderTimer();
            }
          } else if (mode.mode === "speaking") {
            this.agentMode = "speaking";
            this.clearIdleTimer();
            this.clearQuietReminderTimer();
          }
        },
        onError: (message) => {
          console.error("[ElevenLabsAgent] Error:", message);
        },
      });

      // Immediately mute mic — we only send text input, not voice
      this.conversation.setMicMuted(true);

      // Flush queued events
      for (const event of this.eventQueue) {
        this.conversation.sendUserMessage(formatEvent(event));
      }
      this.hasPendingEvents = this.eventQueue.length > 0;
      this.eventQueue = [];
    } catch (err) {
      this._connectionError =
        err instanceof Error ? err.message : "Connection failed";
      this.onStateChange?.();
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.connecting = false;
    this.reconnectAttempted = false;
    this.clearIdleTimer();
    this.clearQuietReminderTimer();
    if (this.conversation) {
      try {
        await this.conversation.endSession();
      } catch {
        // Ignore errors during teardown
      }
      this.conversation = null;
    }
    this.eventQueue = [];
    this.pendingContextUpdates = [];
    this.agentMode = "listening";
  }

  sendEvent(event: AgentGameEvent): void {
    const text = formatEvent(event);
    console.log("[ElevenLabsAgent] Sending:", text);
    this.hasPendingEvents = true;
    this.clearIdleTimer();
    this.clearQuietReminderTimer();

    if (!this.conversation) {
      this.eventQueue.push(event);
      return;
    }

    // Fix 2: If agent is speaking, use sendContextualUpdate to avoid interruption
    if (this.agentMode === "speaking") {
      this.conversation.sendContextualUpdate(text);
      this.pendingContextUpdates.push(event);
    } else {
      this.conversation.sendUserMessage(text);
    }
  }

  setVolume(volume: number): void {
    this.conversation?.setVolume({ volume });
  }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      console.log("[ElevenLabsAgent] Idle timeout — disconnecting");
      this.disconnect();
      this.onStateChange?.();
    }, IDLE_DISCONNECT_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.hasPendingEvents = false;
  }

  // Fix 1: Send contextual update during long pauses to prevent "are you still there?"
  private resetQuietReminderTimer(): void {
    this.clearQuietReminderTimer();
    this.quietReminderTimer = setTimeout(() => {
      if (
        this.conversation &&
        this.agentMode === "listening" &&
        !this.hasPendingEvents
      ) {
        console.log("[ElevenLabsAgent] Sending quiet reminder");
        this.conversation.sendContextualUpdate(
          "Game in progress. Waiting for next event.",
        );
        // Re-arm the timer in case the pause continues
        this.resetQuietReminderTimer();
      }
    }, QUIET_REMINDER_MS);
  }

  private clearQuietReminderTimer(): void {
    if (this.quietReminderTimer) {
      clearTimeout(this.quietReminderTimer);
      this.quietReminderTimer = null;
    }
  }
}
