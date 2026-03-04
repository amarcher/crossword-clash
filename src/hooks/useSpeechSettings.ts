import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadTTSSettings,
  saveTTSSettings,
  DEFAULT_TTS_SETTINGS,
} from "../lib/ttsSettings";
import type { TTSSettings, TTSEngine } from "../lib/ttsSettings";
import {
  ELEVENLABS_VOICES,
  loadElevenLabsGate,
  isElevenLabsAvailable,
} from "../lib/elevenLabsClient";
import type { ElevenLabsVoice } from "../lib/elevenLabsClient";
import { AudioQueue } from "../lib/audioQueue";

export interface SpeechSettings {
  muted: boolean;
  voiceName: string | null;
  rate: number;
  pitch: number;
  voices: SpeechSynthesisVoice[];
  settingsOpen: boolean;
  engine: TTSEngine;
  elevenLabsAvailable: boolean;
  elevenLabsVoiceId: string | null;
  elevenLabsVoices: ElevenLabsVoice[];
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setVoiceName: (name: string | null) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setEngine: (engine: TTSEngine) => void;
  setElevenLabsVoiceId: (id: string | null) => void;
  speak: (text: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

function hasSpeech(): boolean {
  return typeof speechSynthesis !== "undefined";
}

function getVoicesList(): SpeechSynthesisVoice[] {
  if (!hasSpeech()) return [];
  return speechSynthesis.getVoices();
}

function fetchElevenLabsAudio(
  text: string,
  voiceId: string,
): Promise<ArrayBuffer> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const gate = loadElevenLabsGate();
  if (!supabaseUrl || !gate) {
    return Promise.reject(new Error("ElevenLabs not configured"));
  }

  return fetch(`${supabaseUrl}/functions/v1/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gate.token}`,
    },
    body: JSON.stringify({ text, voice_id: voiceId }),
  }).then((res) => {
    if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
    return res.arrayBuffer();
  });
}

export function useSpeechSettings(): SpeechSettings {
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(getVoicesList);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elAvailable] = useState(() => isElevenLabsAvailable());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const audioQueueRef = useRef<AudioQueue | null>(null);

  // Initialize audio queue lazily
  const getAudioQueue = useCallback(() => {
    if (!audioQueueRef.current) {
      audioQueueRef.current = new AudioQueue({
        fetchAudio: (text: string) => {
          const voiceId =
            settingsRef.current.elevenLabsVoiceId ||
            ELEVENLABS_VOICES[0].id;
          return fetchElevenLabsAudio(text, voiceId);
        },
      });
    }
    return audioQueueRef.current;
  }, []);

  // Cleanup audio queue on unmount
  useEffect(() => {
    return () => {
      audioQueueRef.current?.destroy();
    };
  }, []);

  // Load voices (Chrome fires voiceschanged async — may fire before this effect runs)
  useEffect(() => {
    if (!hasSpeech()) return;
    const update = () => setVoices(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", update);
    update(); // pick up voices that loaded before the listener was attached
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);

  // Persist on change
  useEffect(() => {
    saveTTSSettings(settings);
  }, [settings]);

  const setMuted = useCallback((muted: boolean) => {
    setSettings((prev) => ({ ...prev, muted }));
  }, []);

  const toggleMute = useCallback(() => {
    setSettings((prev) => ({ ...prev, muted: !prev.muted }));
  }, []);

  const setVoiceName = useCallback((voiceName: string | null) => {
    setSettings((prev) => ({ ...prev, voiceName }));
  }, []);

  const setRate = useCallback((rate: number) => {
    setSettings((prev) => ({ ...prev, rate }));
  }, []);

  const setPitch = useCallback((pitch: number) => {
    setSettings((prev) => ({ ...prev, pitch }));
  }, []);

  const setEngine = useCallback((engine: TTSEngine) => {
    setSettings((prev) => ({ ...prev, engine }));
  }, []);

  const setElevenLabsVoiceId = useCallback((elevenLabsVoiceId: string | null) => {
    setSettings((prev) => ({ ...prev, elevenLabsVoiceId }));
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (settingsRef.current.muted) return;

      if (settingsRef.current.engine === "elevenlabs" && elAvailable) {
        getAudioQueue().enqueue(text);
        return;
      }

      // Browser TTS fallback
      if (!hasSpeech()) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settingsRef.current.rate;
      utterance.pitch = settingsRef.current.pitch;
      const { voiceName } = settingsRef.current;
      if (voiceName) {
        const voice = speechSynthesis.getVoices().find((v) => v.name === voiceName);
        if (voice) utterance.voice = voice;
      }
      speechSynthesis.speak(utterance);
    },
    [elAvailable, getAudioQueue],
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return {
    muted: settings.muted,
    voiceName: settings.voiceName,
    rate: settings.rate,
    pitch: settings.pitch,
    voices,
    settingsOpen,
    engine: settings.engine,
    elevenLabsAvailable: elAvailable,
    elevenLabsVoiceId: settings.elevenLabsVoiceId,
    elevenLabsVoices: ELEVENLABS_VOICES,
    setMuted,
    toggleMute,
    setVoiceName,
    setRate,
    setPitch,
    setEngine,
    setElevenLabsVoiceId,
    speak,
    openSettings,
    closeSettings,
  };
}

export { DEFAULT_TTS_SETTINGS };
