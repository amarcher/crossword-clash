import { narratorAudioContext } from "./audioUnlock";
import { formatEvent } from "./events";
import { CLAUDE_SYSTEM_PROMPT } from "./prompts";
import { NARRATOR_UNAVAILABLE, NARRATOR_UNAVAILABLE_BUDGET, NARRATOR_UNAVAILABLE_PLUS } from "../narratorBudget";
import { consumeNarratorDemo } from "../narratorDemo";
import { narratorHeaders, narratorRefusal } from "./narratorAuth";
import type { NarratorBackend, AgentGameEvent } from "./types";

const SYSTEM_PROMPT = CLAUDE_SYSTEM_PROMPT;

interface Message {
  role: "user" | "assistant";
  content: string;
}

/** The functions' query string: the room (a Plus player in it covers the host; plusAccess.ts roomSponsor) and the demo flag. */
function narratorQuery(gameId: string | null, demo: boolean): string {
  const params = new URLSearchParams();
  if (gameId) params.set("game", gameId);
  if (demo) params.set("demo", "1");
  const q = params.toString();
  return q ? `?${q}` : "";
}

async function fetchCommentary(
  messages: Message[],
  demo = false,
  gameId: string | null = null,
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Claude narrator not configured");
  }

  const url = `${supabaseUrl}/functions/v1/narrator-claude${narratorQuery(gameId, demo)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: await narratorHeaders(),
    body: JSON.stringify({ messages, systemPrompt: SYSTEM_PROMPT }),
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`rate_limited:${data.retryAfterMs ?? 3600000}`);
  }

  // 402: the owner's budget cap, "Plus required" or a subscriber's spent
  // allowance — a clean, machine-readable signal so the hook can degrade
  // gracefully instead of erroring/retrying in a loop.
  const refusal = await narratorRefusal(res);
  if (refusal) throw refusal;

  if (!res.ok) {
    throw new Error(`Claude narrator failed: ${res.status}`);
  }

  const data = await res.json();
  return data.text;
}

/**
 * Request commentary, transparently spending one demo allowance to sample the
 * narrator when the budget cap is hit. This backend (Claude text + ElevenLabs
 * TTS) is the single demo-eligible narrator. Returns `demo: true` when the
 * response came from the demo allowance, so the caller speaks it via a likewise
 * bounded, fail-closed TTS demo grant — the sample plays in the real premium
 * voice (the feature's appeal) while the expensive realtime backends stay
 * hard-capped with no demo grace.
 */
async function requestCommentary(
  messages: Message[],
  gameId: string | null = null,
): Promise<{ text: string; demo: boolean }> {
  try {
    return { text: await fetchCommentary(messages, false, gameId), demo: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Over budget, or not a subscriber: the same bounded sample either way.
    if ((msg === NARRATOR_UNAVAILABLE_BUDGET || msg === NARRATOR_UNAVAILABLE_PLUS) && consumeNarratorDemo()) {
      return { text: await fetchCommentary(messages, true, gameId), demo: true };
    }
    throw err;
  }
}

function fetchTTSAudio(
  text: string,
  voiceId: string,
  demo = false,
  gameId: string | null = null,
): Promise<ArrayBuffer> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("TTS not configured"));
  }

  // During an over-budget demo, ask the tts function to spend one bounded,
  // fail-closed demo grant so the sample plays in the real premium voice.
  return narratorHeaders()
    .then((headers) =>
      fetch(`${supabaseUrl}/functions/v1/tts${narratorQuery(gameId, demo)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voice_id: voiceId }),
      }),
    )
    .then(async (res) => {
    // Budget cap, Plus required or allowance spent (demo grants spent too):
    // surface the machine-readable sentinel so the narrator degrades gracefully.
    const refusal = await narratorRefusal(res);
    if (refusal) throw refusal;
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

export type TTSEngine = "browser" | "elevenlabs";

export interface ClaudeNarratorOptions {
  ttsEngine?: TTSEngine;
  voiceName?: string | null;
  rate?: number;
  pitch?: number;
  elevenLabsVoiceId?: string | null;
  /** The room being narrated: a Plus player in it covers the host on a device that has none. */
  gameId?: string | null;
}

export class ClaudeNarratorBackend implements NarratorBackend {
  readonly name = "claude";
  private ttsEngine: TTSEngine;
  private voiceName: string | null;
  private rate: number;
  private pitch: number;
  private elevenLabsVoiceId: string | null;
  private gameId: string | null;
  private messages: Message[] = [];
  private _isConnected = false;
  private _connectionError: string | null = null;
  private onStateChange: (() => void) | null = null;
  private onIdle: (() => void) | null = null;
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
    this.gameId = options?.gameId ?? null;
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
      // The shared context a tap unlocked (audioUnlock.ts): one made here, as
      // the game starts, is suspended for good on iOS.
      if (this.ttsEngine === "elevenlabs") {
        this.audioContext = narratorAudioContext();
        if (!this.audioContext) throw new Error("No audio output");
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
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }
    if (this.audioContext) {
      // The context is shared and stays unlocked for the next game.
      this.gainNode?.disconnect();
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
      this.onIdle?.();
      return;
    }

    this.processing = true;

    // Batch all pending events into a single message
    const events = this.eventQueue.splice(0);
    const userText = events.map((e) => formatEvent(e)).join("\n");
    this.messages.push({ role: "user", content: userText });

    try {
      const { text: commentary, demo } = await requestCommentary(this.messages, this.gameId);
      if (this.intentionalDisconnect) return;

      console.log("[ClaudeNarrator] Commentary:", commentary);
      this.messages.push({ role: "assistant", content: commentary });

      // Speak the commentary. A demo sample plays in the host's configured
      // voice (the premium ElevenLabs voice IS the feature's appeal), spending
      // one bounded, fail-closed TTS demo grant — see fetchTTSAudio.
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
      if (msg.startsWith(NARRATOR_UNAVAILABLE)) {
        this._connectionError = msg;
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

    if (this.ttsEngine === "browser") {
      await this.speakBrowser(text);
    } else {
      await this.speakElevenLabs(text, demo);
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

  private async speakElevenLabs(text: string, demo = false): Promise<void> {
    if (!this.audioContext || !this.gainNode) return;

    try {
      // Resume if suspended (autoplay policy). Never wait on it for long: on
      // WebKit a resume with no gesture behind it can stay pending, which
      // froze the whole queue.
      if (this.audioContext.state === "suspended") {
        await Promise.race([this.audioContext.resume(), new Promise((r) => setTimeout(r, 1500))]);
      }

      const voiceId = this.elevenLabsVoiceId || DEFAULT_VOICE_ID;
      const audioData = await fetchTTSAudio(text, voiceId, demo, this.gameId);
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
      // A budget/demo-exhaustion signal must propagate so processQueue can
      // settle the narrator into the "taking a break" state; any other TTS
      // failure is non-fatal and shouldn't kill the narrator.
      if (err instanceof Error && err.message.startsWith(NARRATOR_UNAVAILABLE)) {
        throw err;
      }
      console.error("[ClaudeNarrator] TTS failed:", err);
    }
  }
}
