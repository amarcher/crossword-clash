import { supabase } from "./supabaseClient";
import { fetchGameState } from "./puzzleService";
import type { Puzzle } from "../types/puzzle";

export interface SpectatorRoom {
  gameId: string;
  puzzle: Puzzle;
  state: NonNullable<Awaited<ReturnType<typeof fetchGameState>>>;
}

/** Read-only: a display never creates a player or changes host ownership. */
export async function fetchSpectatorRoom(code: string, previous?: SpectatorRoom | null): Promise<SpectatorRoom | null> {
  if (!supabase || !/^[A-Z0-9]{6}$/.test(code)) return null;
  const { data: game, error } = await supabase.from("games")
    .select("id, puzzle_id").eq("short_code", code).single();
  if (error || !game) return null;
  const state = await fetchGameState(game.id);
  if (!state) return null;
  if (previous?.gameId === game.id) return { ...previous, state };
  const { data: row, error: puzzleError } = await supabase.from("puzzles")
    .select("title, author, width, height, grid, clues").eq("id", game.puzzle_id).single();
  if (puzzleError || !row) return null;
  return {
    gameId: game.id,
    puzzle: { title: row.title, author: row.author, width: row.width, height: row.height,
      cells: row.grid as Puzzle["cells"], clues: row.clues as Puzzle["clues"] },
    state,
  };
}
