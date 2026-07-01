import type { CellState } from "./puzzle";

export type GameStatus = "waiting" | "active" | "completed";

/**
 * How the room plays the puzzle:
 * - "versus": one shared grid, players race to claim cells (the classic mode).
 * - "coop":   one shared grid, everyone fills it together toward a team finish.
 * - "async":  every player solves their OWN copy; ranking = completion time.
 */
export type RaceMode = "versus" | "coop" | "async";

export interface GameSettings {
  wrongAnswerTimeoutSeconds: number;
  /** Absent in pre-existing persisted settings — treat as "versus". */
  raceMode?: RaceMode;
}

export interface Player {
  id: string;
  gameId: string;
  userId: string;
  displayName: string;
  color: string;
  score: number;
  /** Async race: finish time in whole seconds, once this player finished. */
  raceSeconds?: number | null;
}

export interface Game {
  id: string;
  puzzleId: string;
  status: GameStatus;
  /** Map of "row,col" → CellState */
  cells: Record<string, CellState>;
  players: Player[];
  createdAt: string;
  shortCode: string;
}
