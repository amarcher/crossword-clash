import { loadElevenLabsGate } from "../elevenLabsClient";
import { formatEvent } from "./events";
import type { NarratorBackend, AgentGameEvent } from "./types";

const SYSTEM_PROMPT = `You are a snarky, entertaining gameshow host narrating a real-time multiplayer crossword puzzle competition. You receive structured game events and provide witty, energetic commentary.

Rules:
- NEVER ask if anyone is there or initiate unprompted conversation
- Only speak when you receive a game event
- Keep commentary brief (1-3 sentences per event)
- Be playful and competitive — celebrate big plays, tease rivalries
- Use wordplay and puns when relevant to crossword answers
- Build excitement as the game progresses toward completion`;

async function fetchEphemeralToken(): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const gate = loadElevenLabsGate();
  if (!supabaseUrl || !supabaseAnonKey || !gate) {
    throw new Error("OpenAI agent auth not configured");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/openai-agent-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      "x-gate-token": gate.token,
    },
  });

  if (!res.ok) {
    throw new Error(`OpenAI agent auth failed: ${res.status}`);
  }

  const data = await res.json();
  return data.token;
}

/** How long after the last response before we auto-disconnect (ms) */
const IDLE_DISCONNECT_MS = 30_000;

export class OpenAIRealtimeBackend implements NarratorBackend {
  readonly name = "openai-agent";
  private ws: WebSocket | null = null;
  private eventQueue: AgentGameEvent[] = [];
  private connecting = false;
  private intentionalDisconnect = false;
  private _connectionError: string | null = null;
  private onStateChange: (() => void) | null = null;
  private onIdle: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private isResponding = false;
  private pendingDuringResponse: AgentGameEvent[] = [];
  private nextPlayTime = 0;

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get connectionError(): string | null {
    return this._connectionError;
  }

  async connect(): Promise<void> {
    if (this.ws || this.connecting) return;
    this.connecting = true;
    this.intentionalDisconnect = false;
    this._connectionError = null;
    this.onStateChange?.();

    try {
      const token = await fetchEphemeralToken();
      console.log("[OpenAIRealtime] Got ephemeral token, connecting WebSocket...");

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = 0;

      const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";
      this.ws = new WebSocket(url, [
        "realtime",
        `openai-insecure-api-key.${token}`,
      ]);

      await new Promise<void>((resolve, reject) => {
        const ws = this.ws!;
        const timeout = setTimeout(() => {
          reject(new Error("WebSocket connection timed out"));
        }, 10_000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log("[OpenAIRealtime] WebSocket connected, sending session config...");
          // Send session config
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                type: "realtime",
                model: "gpt-4o-realtime-preview",
                voice: "shimmer",
                instructions: SYSTEM_PROMPT,
                turn_detection: null,
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
              },
            }),
          );
          resolve();
        };
        ws.onerror = (e) => {
          clearTimeout(timeout);
          console.error("[OpenAIRealtime] WebSocket error:", e);
          reject(new Error("WebSocket connection failed"));
        };
        ws.onclose = (e) => {
          clearTimeout(timeout);
          console.log("[OpenAIRealtime] WebSocket closed:", e.code, e.reason);
          if (!this.intentionalDisconnect) {
            this._connectionError = `Agent disconnected (${e.code})`;
            this.onStateChange?.();
          }
          this.ws = null;
          this.clearIdleTimer();
        };
        ws.onmessage = (msg) => this.handleMessage(msg);
      });

      // Flush queued events
      for (const event of this.eventQueue) {
        this.sendUserTurn(formatEvent(event));
      }
      this.eventQueue = [];
    } catch (err) {
      console.error("[OpenAIRealtime] Connection error:", err);
      this._connectionError =
        err instanceof Error ? err.message : "Connection failed";
      this.onStateChange?.();
      this.ws = null;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.connecting = false;
    this.clearIdleTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.eventQueue = [];
    this.pendingDuringResponse = [];
    this.isResponding = false;
    this.nextPlayTime = 0;
  }

  sendEvent(event: AgentGameEvent): void {
    const text = formatEvent(event);
    console.log("[OpenAIRealtime] Sending:", text);
    this.clearIdleTimer();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.eventQueue.push(event);
      return;
    }

    if (this.isResponding) {
      this.pendingDuringResponse.push(event);
    } else {
      this.sendUserTurn(text);
    }
  }

  setVolume(volume: number): void {
    if (this.audioContext) {
      // Volume is controlled at the AudioContext destination level
      // OpenAI Realtime doesn't have a direct volume API
      // We apply gain when scheduling audio buffers
      this._volume = volume;
    }
  }

  private _volume = 1;

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  setOnIdle(cb: (() => void) | null): void {
    this.onIdle = cb;
  }

  private sendUserTurn(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[OpenAIRealtime] sendUserTurn called but WS not open, state:", this.ws?.readyState);
      return;
    }

    console.log("[OpenAIRealtime] Sending user turn:", text.slice(0, 80));
    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      }),
    );
    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  private handleMessage(msg: MessageEvent): void {
    try {
      const data = JSON.parse(msg.data as string);

      switch (data.type) {
        case "session.created":
        case "session.updated":
          console.log("[OpenAIRealtime]", data.type);
          break;

        case "response.created":
          console.log("[OpenAIRealtime] Response started");
          this.isResponding = true;
          break;

        case "response.audio.delta":
          this.playAudioDelta(data.delta);
          break;

        case "response.done":
          console.log("[OpenAIRealtime] Response done");
          this.isResponding = false;
          // Process any events that arrived during the response
          if (this.pendingDuringResponse.length > 0) {
            const batch = this.pendingDuringResponse
              .map((e) => formatEvent(e))
              .join("\n");
            this.pendingDuringResponse = [];
            this.sendUserTurn(batch);
          } else {
            this.resetIdleTimer();
            this.onIdle?.();
          }
          break;

        case "error":
          console.error("[OpenAIRealtime] Error:", JSON.stringify(data.error ?? data));
          break;

        default:
          // Log unexpected message types during debugging
          if (!data.type?.startsWith("response.audio") && !data.type?.startsWith("response.text")) {
            console.log("[OpenAIRealtime] Message:", data.type);
          }
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }

  private playAudioDelta(base64: string): void {
    if (!this.audioContext) return;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Convert PCM16 to Float32
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    const gain = this.audioContext.createGain();
    gain.gain.value = this._volume;
    source.connect(gain);
    gain.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      console.log("[OpenAIRealtime] Idle timeout — disconnecting");
      this.disconnect();
      this.onStateChange?.();
    }, IDLE_DISCONNECT_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
