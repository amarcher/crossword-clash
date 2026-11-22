/**
 * The way back into a puzzle finished in a room on a shared grid (Andrew,
 * 2026-11-21: after closing the finish there was no route to the board or
 * its replay, only "Play solo"). The server keeps a finished room's grid,
 * each square with its claimant and time, and its players (retention: 90
 * days), and all three tables are readable, so the result is rebuilt from
 * there on any device: nothing new is stored.
 */
import type { CellState, Puzzle } from "../types/puzzle";
import type { Player } from "../types/game";
import { fetchGameState } from "./puzzleService";
import { puzzleIdentity } from "./soloStats";
import { supabase } from "./supabaseClient";

export interface RoomResult {
  gameId: string;
  /** The finished grid: every square with its letter, claimant and claim time. */
  cells: Record<string, CellState>;
  /** The room's players in join order, each with the squares they hold. */
  players: Player[];
  /** The room's time in whole seconds, or null when its start was not kept. */
  seconds: number | null;
  coop: boolean;
  /** ms epoch of the room's start, for the replay's zero. */
  startedAt: number | null;
  settings: unknown;
}

/** Whether every white square of the puzzle is correct in `cells`. */
export function isFinishedGrid(puzzle: Pick<Puzzle, "cells">, cells: Record<string, Pick<CellState, "correct">>): boolean {
  return puzzle.cells.every((row) => row.every((c) => c.solution === null || !!cells[`${c.row},${c.col}`]?.correct));
}

/**
 * The latest shared-grid room this player finished this puzzle in, or null:
 * never in one, the room is gone, or its grid was not finished. Never throws.
 */
export async function fetchRoomResult(puzzle: Puzzle, userId: string): Promise<RoomResult | null> {
  if (!supabase) return null;
  try {
    // The room's copy of the puzzle: same title and size, checked by identity (the solution).
    const key = puzzleIdentity(puzzle);
    const { data: copies } = await supabase.from("puzzles").select("id, title, width, height, grid").eq("title", puzzle.title).eq("width", puzzle.width).eq("height", puzzle.height);
    const puzzleIds = (copies ?? [])
      .filter((p) => puzzleIdentity({ title: p.title, width: p.width, height: p.height, cells: p.grid as Puzzle["cells"] }) === key)
      .map((p) => p.id);
    if (puzzleIds.length === 0) return null;
    const { data: seats } = await supabase
      .from("players")
      .select("game_id, games!inner(id, puzzle_id, status, completed_at)")
      .eq("user_id", userId)
      .in("games.puzzle_id", puzzleIds)
      .in("games.status", ["completed", "closed"]);
    const rooms = ((seats ?? []) as unknown as { games: { id: string; completed_at: string | null } }[])
      .map((s) => s.games)
      .filter((g) => !!g?.completed_at)
      .sort((a, b) => Date.parse(b.completed_at as string) - Date.parse(a.completed_at as string));
    for (const room of rooms.slice(0, 3)) {
      const state = await fetchGameState(room.id);
      if (!state || state.settings?.raceMode === "async" || !isFinishedGrid(puzzle, state.cells)) continue;
      const held = new Map<string, number>();
      for (const c of Object.values(state.cells)) if (c.correct && c.playerId) held.set(c.playerId, (held.get(c.playerId) ?? 0) + 1);
      return {
        gameId: room.id,
        cells: state.cells,
        players: state.players.map((p) => ({ ...p, score: held.get(p.userId) ?? 0 })),
        seconds: state.startedAt != null && state.completedAt != null && state.completedAt >= state.startedAt ? Math.round((state.completedAt - state.startedAt) / 1000) : null,
        coop: state.settings?.raceMode === "coop",
        startedAt: state.startedAt,
        settings: state.settings,
      };
    }
    return null;
  } catch {
    return null;
  }
}
