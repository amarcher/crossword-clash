const GATE_STORAGE_KEY = "crossword-clash-elevenlabs";

export interface ElevenLabsVoice {
  id: string;
  name: string;
  description: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, young female" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, middle-aged male" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Well-rounded, young male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft, young female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Deep, young male" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Emotional, young female" },
];

export interface ElevenLabsGate {
  enabled: boolean;
  token: string;
}

export function loadElevenLabsGate(): ElevenLabsGate | null {
  try {
    const raw = localStorage.getItem(GATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.enabled !== "boolean" ||
      typeof parsed.token !== "string" ||
      !parsed.enabled ||
      !parsed.token
    ) {
      return null;
    }
    return { enabled: parsed.enabled, token: parsed.token };
  } catch {
    return null;
  }
}

export function isElevenLabsAvailable(): boolean {
  return loadElevenLabsGate() !== null;
}
