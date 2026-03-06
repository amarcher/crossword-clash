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
- Build excitement as the game progresses toward completion
- Respond with ONLY the spoken commentary text — no stage directions, no asterisks, no parentheticals`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function fetchCommentary(
  messages: Message[],
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const gate = loadElevenLabsGate();
  if (!supabaseUrl || !supabaseAnonKey || !gate) {
    throw new Error("Claude narrator not configured");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/narrator-claude`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      "x-gate-token": gate.token,
    },
    body: JSON.stringify({ messages, systemPrompt: SYSTEM_PROMPT }),
  });

  if (!res.ok) {
    throw new Error(`Claude narrator failed: ${res.status}`);
  }

  const data = await res.json();
  return data.text;
}

function fetchTTSAudio(
  text: string,
  voiceId: string,
): Promise<ArrayBuffer> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const gate = loadElevenLabsGate();
  if (!supabaseUrl || !supabaseAnonKey || !gate) {
    return Promise.reject(new Error("TTS not configured"));
  }

  return fetch(`${supabaseUrl}/functions/v1/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      "x-gate-token": gate.token,
    },
    body: JSON.stringify({ text, voice_id: voiceId }),
  }).then(async (res) => {
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`TTS request failed: ${res.status} ${errBody}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("audio")) {
      const body = await res.text().catch(() => "");
      throw new Error(`TTS returned non-audio response (${ct}): ${body}`);
    }
    return res.arrayBuffer();
  });
}

/** Default ElevenLabs voice for Claude narrator TTS */
const DEFAULT_VOICE_ID = "TxGEqnHWrfWFTfGW9XjX"; // Josh — deep, young male

/** How long after the last commentary before we auto-disconnect (ms) */
const IDLE_DISCONNECT_MS = 30_000;

export class ClaudeNarratorBackend implements NarratorBackend {
  readonly name = "claude";
  private messages: Message[] = [];
  private _isConnected = false;
  private _connectionError: string | null = null;
  private onStateChange: (() => void) | null = null;
  private onIdle: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private eventQueue: AgentGameEvent[] = [];
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private intentionalDisconnect = false;
  private _volume = 1;
  private gainNode: GainNode | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get connectionError(): string | null {
    return this._connectionError;
  }

  async connect(): Promise<void> {
    if (this._isConnected) return;
    this.intentionalDisconnect = false;
    this._connectionError = null;
    this.messages = [];

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const gate = loadElevenLabsGate();
      if (!supabaseUrl || !gate) {
        throw new Error("Claude narrator not configured");
      }
      // Create AudioContext now (during user interaction) so it's unlocked
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this._volume;
      this.gainNode.connect(this.audioContext.destination);
      this._isConnected = true;
      this.onStateChange?.();
    } catch (err) {
      this._connectionError =
        err instanceof Error ? err.message : "Connection failed";
      this.onStateChange?.();
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this._isConnected = false;
    this.messages = [];
    this.eventQueue = [];
    this.processing = false;
    this.clearIdleTimer();
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }
    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.gainNode = null;
    }
    this.onStateChange?.();
  }

  sendEvent(event: AgentGameEvent): void {
    if (!this._isConnected || this.intentionalDisconnect) return;

    const text = formatEvent(event);
    console.log("[ClaudeNarrator] Sending:", text);
    this.clearIdleTimer();

    this.eventQueue.push(event);
    if (!this.processing) {
      this.processQueue();
    }
  }

  setVolume(volume: number): void {
    this._volume = volume;
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  setOnStateChange(cb: (() => void) | null): void {
    this.onStateChange = cb;
  }

  setOnIdle(cb: (() => void) | null): void {
    this.onIdle = cb;
  }

  private async processQueue(): Promise<void> {
    if (this.eventQueue.length === 0 || !this._isConnected) {
      this.processing = false;
      this.resetIdleTimer();
      this.onIdle?.();
      return;
    }

    this.processing = true;

    // Batch all pending events into a single message
    const events = this.eventQueue.splice(0);
    const userText = events.map((e) => formatEvent(e)).join("\n");
    this.messages.push({ role: "user", content: userText });

    try {
      const commentary = await fetchCommentary(this.messages);
      if (this.intentionalDisconnect) return;

      console.log("[ClaudeNarrator] Commentary:", commentary);
      this.messages.push({ role: "assistant", content: commentary });

      // Speak the commentary via ElevenLabs TTS
      await this.speakText(commentary);
    } catch (err) {
      console.error("[ClaudeNarrator] Error:", err);
    }

    // Process any events that arrived while we were fetching/speaking
    this.processQueue();
  }

  private async speakText(text: string): Promise<void> {
    if (this.intentionalDisconnect || !this.audioContext || !this.gainNode) return;

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    try {
      const audioData = await fetchTTSAudio(text, DEFAULT_VOICE_ID);
      if (this.intentionalDisconnect || !this.audioContext) return;

      const audioBuffer = await this.audioContext.decodeAudioData(audioData);
      if (this.intentionalDisconnect || !this.audioContext) return;

      await new Promise<void>((resolve) => {
        const source = this.audioContext!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode!);
        this.currentSource = source;

        source.onended = () => {
          this.currentSource = null;
          resolve();
        };
        source.start();
      });
    } catch (err) {
      console.error("[ClaudeNarrator] TTS failed:", err);
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      console.log("[ClaudeNarrator] Idle timeout — disconnecting");
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
