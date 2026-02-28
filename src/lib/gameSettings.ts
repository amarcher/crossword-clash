import type { GameSettings } from "../types/game";

export const WRONG_ANSWER_TIMEOUT_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "1s", value: 1 },
  { label: "2s", value: 2 },
  { label: "3s", value: 3 },
  { label: "5s", value: 5 },
];

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  wrongAnswerTimeoutSeconds: 0,
};
