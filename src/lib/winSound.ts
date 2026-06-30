/**
 * Tiny WebAudio "you won" chime. No audio asset — synthesised on the fly from
 * WIN_CHIME_NOTES so the bundle stays lean. Respects the app mute setting and
 * degrades to a no-op anywhere AudioContext is unavailable (jsdom, old Safari).
 */

import { WIN_CHIME_NOTES } from "./celebration";
import { loadTTSSettings } from "./ttsSettings";

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Lazily-created shared context — created on first (user-gesture-triggered) play. */
let sharedCtx: AudioContext | null = null;

/**
 * Whether the win sound should be heard. The TTS settings `muted` flag is the
 * app's single source of truth for "audio off", shared with the TV announcer.
 */
export function shouldPlayWinSound(muted: boolean): boolean {
  return !muted;
}

export interface PlayWinSoundOptions {
  /** Override the mute check (defaults to the persisted app mute setting). */
  muted?: boolean;
}

/**
 * Play the celebratory chime once. Safe to call unconditionally — it self-gates
 * on the mute setting and on AudioContext availability.
 */
export function playWinSound(options: PlayWinSoundOptions = {}): void {
  const muted = options.muted ?? safeLoadMuted();
  if (!shouldPlayWinSound(muted)) return;

  const Ctor = getAudioContextCtor();
  if (!Ctor) return;

  try {
    if (!sharedCtx) sharedCtx = new Ctor();
    const ctx = sharedCtx;
    // Autoplay policies can leave the context suspended until a gesture; the
    // completion is reached via keypress/click, so a resume is allowed.
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);

    for (const note of WIN_CHIME_NOTES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = note.freq;

      const start = now + note.start;
      const end = start + note.duration;
      // Short attack, exponential release for a soft bell-like envelope.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(1, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // Never let a celebration flourish throw into render/effect code.
  }
}

function safeLoadMuted(): boolean {
  try {
    return loadTTSSettings().muted;
  } catch {
    return false;
  }
}
