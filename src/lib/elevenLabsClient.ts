export interface ElevenLabsVoice {
  id: string;
  name: string;
  description: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: "6Ac71viMXq5tLn2bwYdz", name: "Andrew", description: "Fatherly voice" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, young female" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, middle-aged male" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Well-rounded, young male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft, young female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Deep, young male" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Emotional, young female" },
];

export function isElevenLabsAvailable(): boolean {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  return !!supabaseUrl;
}
