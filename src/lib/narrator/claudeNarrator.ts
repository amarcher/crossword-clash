import { formatEvent } from "./events";
import { CLAUDE_SYSTEM_PROMPT } from "./prompts";
import { NARRATOR_UNAVAILABLE_BUDGET } from "../narratorBudget";
import { consumeNarratorDemo } from "../narratorDemo";
import type { NarratorBackend, AgentGameEvent } from "./types";

const SYSTEM_PROMPT = CLAUDE_SYSTEM_PROMPT;

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function fetchCommentary(
  messages: Message[],
  demo = false,
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Claude narrator not configured");
  }

  const url = `${supabaseUrl}/functions/v1/narrator-claude${demo ? "?demo=1" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ messages, systemPrompt: SYSTEM_PROMPT }),
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`rate_limited:${data.retryAfterMs ?? 3600000}`);
  }

  // Owner monthly budget cap reached — surface a clean, machine-readable signal
  // so the hook can degrade gracefully instead of erroring/retrying in a loop.
  if (res.status === 402) {
    throw new Error(NARRATOR_UNAVAILABLE_BUDGET);
  }

  if (!res.ok) {
    throw new Error(`Claude narrator failed: ${res.status}`);
  }

  const data = await res.json();
  return data.text;
}

/**
 * Request commentary, transparently spending one demo allowance to sample the
 * narrator when the budget cap is hit. Cheapest path only — this backend is the
 * single demo-eligible narrator. Returns `demo: true` when the response came
 * from the demo allowance so the caller can keep demo cost minimal (browser
 * voice instead of paid TTS).
 */
async function requestCommentary(
  messages: Message[],
): Promise<{ text: string; demo: boolean }> {
  try {
    return { text: await fetchCommentary(messages, false), demo: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith(NARRATOR_UNAVAILABLE_BUDGET) && consumeNarratorDemo()) {
      return { text: await fetchCommentary(messages, true), demo: true };
    }
    throw err;
  }
}

function fetchTTSAudio(
  text: string,
  voiceId: string,
): Promise<ArrayBuffer> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!supabaseUrl || !supabaseAnonKey) {
    return Promise.reject(new Error("TTS not configured"));
  }

  return fetch(`${supabaseUrl}/functions/v1/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
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

export type TTSEngine = "browser" | "elevenlabs";

export interface ClaudeNarratorOptions {
  ttsEngine?: TTSEngine;
  voiceName?: string | null;
  rate?: number;
  pitch?: number;
  elevenLabsVoiceId?: string | null;
}

export class ClaudeNarratorBackend implements NarratorBackend {
  readonly name = "claude";
  private ttsEngine: TTSEngine;
  private voiceName: string | null;
  private rate: number;
  private pitch: number;
  private elevenLabsVoiceId: string | null;
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
  private visibilityHandler: (() => void) | null = null;

  constructor(options?: ClaudeNarratorOptions) {
    this.ttsEngine = options?.ttsEngine ?? "elevenlabs";
    this.voiceName = options?.voiceName ?? null;
    this.rate = options?.rate ?? 1;
    this.pitch = options?.pitch ?? 1;
    this.elevenLabsVoiceId = options?.elevenLabsVoiceId ?? null;
  }

  setVoiceSettings(opts: Pick<ClaudeNarratorOptions, "voiceName" | "rate" | "pitch" | "elevenLabsVoiceId">): void {
    if (opts.voiceName !== undefined) this.voiceName = opts.voiceName ?? null;
    if (opts.rate !== undefined) this.rate = opts.rate;
    if (opts.pitch !== undefined) this.pitch = opts.pitch;
    if (opts.elevenLabsVoiceId !== undefined) this.elevenLabsVoiceId = opts.elevenLabsVoiceId ?? null;
  }

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
      if (!supabaseUrl) {
        throw new Error("Claude narrator not configured");
      }
      // Create AudioContext for ElevenLabs TTS (during user interaction so it's unlocked)
      if (this.ttsEngine === "elevenlabs") {
        this.audioContext = new AudioContext();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this._volume;
        this.gainNode.connect(this.audioContext.destination);
        // Suspend on tab background so we don't queue speech that arrives
        // while hidden (browser-dependent: blast on resume vs silent drop).
        if (!this.visibilityHandler) {
          this.visibilityHandler = () => {
            if (document.visibilityState === "hidden") {
              this.audioContext?.suspend().catch(() => {});
            } else {
              this.audioContext?.resume().catch(() => {});
            }
          };
          document.addEventListener("visibilitychange", this.visibilityHandler);
        }
      }
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
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.cancel();
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
      const { text: commentary, demo } = await requestCommentary(this.messages);
      if (this.intentionalDisconnect) return;

      console.log("[ClaudeNarrator] Commentary:", commentary);
      this.messages.push({ role: "assistant", content: commentary });

      // Speak the commentary. During an over-budget demo, force browser voice
      // so the sample never spends a second (paid) ElevenLabs TTS demo grant.
      await this.speakText(commentary, demo);
    } catch (err) {
      console.error("[ClaudeNarrator] Error:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("rate_limited:")) {
        this._connectionError = "Narrator limit reached. Falling back to browser voice.";
        this._isConnected = false;
        this.onStateChange?.();
        return;
      }
      // Monthly budget cap reached (and any demo allowance spent). Surface the
      // machine-readable sentinel so the hook shows the "taking a break" state.
      if (msg.startsWith(NARRATOR_UNAVAILABLE_BUDGET)) {
        this._connectionError = NARRATOR_UNAVAILABLE_BUDGET;
        this._isConnected = false;
        this.onStateChange?.();
        return;
      }
    }

    // Process any events that arrived while we were fetching/speaking.
    // Bail if disconnect happened during the in-flight call/speak.
    if (this.intentionalDisconnect) return;
    this.processQueue();
  }

  private async speakText(text: string, demo = false): Promise<void> {
    if (this.intentionalDisconnect) return;

    if (this.ttsEngine === "browser" || demo) {
      await this.speakBrowser(text);
    } else {
      await this.speakElevenLabs(text);
    }
  }

  private async speakBrowser(text: string): Promise<void> {
    if (typeof speechSynthesis === "undefined") return;

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = this._volume;
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      if (this.voiceName) {
        const voice = speechSynthesis.getVoices().find((v) => v.name === this.voiceName);
        if (voice) utterance.voice = voice;
      }
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }

  private async speakElevenLabs(text: string): Promise<void> {
    if (!this.audioContext || !this.gainNode) return;

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    try {
      const voiceId = this.elevenLabsVoiceId || DEFAULT_VOICE_ID;
      const audioData = await fetchTTSAudio(text, voiceId);
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
