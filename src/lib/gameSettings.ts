import type { GameSettings, RaceMode } from "../types/game";

export const WRONG_ANSWER_TIMEOUT_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "1s", value: 1 },
  { label: "2s", value: 2 },
  { label: "3s", value: 3 },
  { label: "5s", value: 5 },
];

/** Lobby options for the room's play mode. Labels/descriptions are i18n keys. */
export const RACE_MODE_OPTIONS: { value: RaceMode; labelKey: string; descriptionKey: string }[] = [
  { value: "versus", labelKey: "lobby.modeVersus", descriptionKey: "lobby.modeVersusDesc" },
  { value: "coop", labelKey: "lobby.modeCoop", descriptionKey: "lobby.modeCoopDesc" },
  { value: "async", labelKey: "lobby.modeAsync", descriptionKey: "lobby.modeAsyncDesc" },
];

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  wrongAnswerTimeoutSeconds: 0,
  raceMode: "versus",
};

/** Settings written before raceMode existed carry no mode — treat as versus. */
export function resolveRaceMode(
  settings: Pick<GameSettings, "raceMode"> | null | undefined,
): RaceMode {
  const mode = settings?.raceMode;
  return mode === "coop" || mode === "async" ? mode : "versus";
}
