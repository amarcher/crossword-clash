import type { GameSettings, RaceMode } from "../types/game";
import type { PuzzleRef } from "../types/puzzle";

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

/**
 * The room puzzle's link from its settings, checked: settings arrive from the
 * database and from other players' broadcasts, so anything that is not a
 * daily's day and slot or a community puzzle's short ID is no link.
 */
export function resolvePuzzleRef(settings: unknown): PuzzleRef | undefined {
  const ref = (settings as { puzzleRef?: unknown } | null | undefined)?.puzzleRef;
  if (!ref || typeof ref !== "object") return undefined;
  const { day, slot, shortId } = ref as { day?: unknown; slot?: unknown; shortId?: unknown };
  if (typeof shortId === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(shortId)) return { shortId };
  if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && (slot === "mini" || slot === "midi" || slot === "large")) return { day, slot };
  return undefined;
}
