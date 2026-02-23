import { supabase } from "./supabaseClient";
import type { Puzzle, CellState } from "../types/puzzle";

/**
 * Compute SHA-256 hash of an ArrayBuffer for puzzle deduplication.
 */
async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload a puzzle to the database, deduplicating by file hash.
 * Returns the puzzle ID.
 */
export async function uploadPuzzle(
  puzzle: Puzzle,
  fileBuffer?: ArrayBuffer,
): Promise<string | null> {
  if (!supabase) return null;

  const fileHash = fileBuffer ? await sha256(fileBuffer) : null;

  // Check for existing puzzle with same hash
  if (fileHash) {
    const { data: existing } = await supabase
      .from("puzzles")
      .select("id")
      .eq("file_hash", fileHash)
      .single();

    if (existing) return existing.id;
  }

  const { data, error } = await supabase
    .from("puzzles")
    .insert({
      title: puzzle.title,
      author: puzzle.author,
      width: puzzle.width,
      height: puzzle.height,
      grid: puzzle.cells,
      clues: puzzle.clues,
      file_hash: fileHash,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to upload puzzle:", error);
    return null;
  }

  return data.id;
}

/**
 * Create a new game session for a puzzle.
 * Returns the game ID.
 */
export async function createGame(
  puzzleId: string,
  userId: string,
): Promise<string | null> {
  if (!supabase) return null;

  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      puzzle_id: puzzleId,
      status: "active",
    })
    .select("id")
    .single();

  if (gameError || !game) {
    console.error("Failed to create game:", gameError);
    return null;
  }

  const { error: playerError } = await supabase.from("players").insert({
    game_id: game.id,
    user_id: userId,
    display_name: "Player 1",
    color: "#3b82f6",
  });

  if (playerError) {
    console.error("Failed to create player:", playerError);
  }

  return game.id;
}

/**
 * Update game cells and status.
 */
export async function updateGame(
  gameId: string,
  cells: Record<string, CellState>,
  status: string,
  score: number,
  userId: string,
): Promise<void> {
  if (!supabase) return;

  await supabase
    .from("games")
    .update({
      cells,
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", gameId);

  await supabase
    .from("players")
    .update({ score })
    .eq("game_id", gameId)
    .eq("user_id", userId);
}
