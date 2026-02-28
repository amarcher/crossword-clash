import type { CellState } from "./puzzle";

export type GameStatus = "waiting" | "active" | "completed";

export interface GameSettings {
  wrongAnswerTimeoutSeconds: number;
}

export interface Player {
  id: string;
  gameId: string;
  userId: string;
  displayName: string;
  color: string;
  score: number;
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
