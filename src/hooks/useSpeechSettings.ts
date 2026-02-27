import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadTTSSettings,
  saveTTSSettings,
  DEFAULT_TTS_SETTINGS,
} from "../lib/ttsSettings";
import type { TTSSettings } from "../lib/ttsSettings";

export interface SpeechSettings {
  muted: boolean;
  voiceName: string | null;
  rate: number;
  pitch: number;
  voices: SpeechSynthesisVoice[];
  settingsOpen: boolean;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setVoiceName: (name: string | null) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
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

export function useSpeechSettings(): SpeechSettings {
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(getVoicesList);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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

  const speak = useCallback(
    (text: string) => {
      if (!hasSpeech() || settingsRef.current.muted) return;
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
    [],
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
    setMuted,
    toggleMute,
    setVoiceName,
    setRate,
    setPitch,
    speak,
    openSettings,
    closeSettings,
  };
}

export { DEFAULT_TTS_SETTINGS };
