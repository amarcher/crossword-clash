/**
 * The AI host's audio, unlocked by a tap. WebKit (every iOS browser and the
 * app's webview) only lets a page make sound from inside a user gesture: an
 * AudioContext created later, when the game starts, stays suspended, and a
 * `speechSynthesis.speak` with no tap behind it is dropped. The host spoke on
 * a desktop and said nothing on an iPad (Andrew, 2026-11-14).
 *
 * `unlockNarratorAudio()` is called from the taps that lead to speech (Start
 * game, the AI host switch, unmute, Test voice): it creates the one shared
 * context, resumes it, plays a silent sample and speaks an empty utterance.
 * The host then plays through `narratorAudioContext()`.
 */
let shared: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function contextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

/** The shared context, created on first use. Null where Web Audio does not exist. */
export function narratorAudioContext(): AudioContext | null {
  if (shared && shared.state !== "closed") return shared;
  const Ctor = contextCtor();
  if (!Ctor) return null;
  try {
    shared = new Ctor();
  } catch {
    shared = null;
  }
  return shared;
}

/** Call from a tap. Safe to call any number of times. */
export function unlockNarratorAudio(): void {
  const ctx = narratorAudioContext();
  if (ctx) {
    try {
      void ctx.resume().catch(() => undefined);
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, 22050);
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // A context that will not start leaves the host silent, as before.
    }
  }
  try {
    if (typeof speechSynthesis !== "undefined" && !speechSynthesis.speaking) {
      const primer = new SpeechSynthesisUtterance("");
      primer.volume = 0;
      speechSynthesis.speak(primer);
    }
  } catch {
    // No speech synthesis here.
  }
}

/** Test seam. */
export function resetNarratorAudioForTests(): void {
  shared = null;
}
