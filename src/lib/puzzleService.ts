import { supabase } from "./supabaseClient";
import { getPlayerColor } from "./playerColors";
import type { Puzzle, CellState } from "../types/puzzle";
import type { Player } from "../types/game";

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

  // Check for existing puzzle with same hash — update clues/grid in case
  // the normalizer has been fixed since the original upload.
  if (fileHash) {
    const { data: existing } = await supabase
      .from("puzzles")
      .select("id")
      .eq("file_hash", fileHash)
      .single();

    if (existing) {
      const { error: updateError } = await supabase
        .from("puzzles")
        .update({ grid: puzzle.cells, clues: puzzle.clues })
        .eq("id", existing.id);
      if (updateError) {
        console.error("Failed to update puzzle clues:", updateError);
      }
      return existing.id;
    }
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
 * When multiplayer is true, status starts as "waiting" and short_code is auto-generated.
 * Returns { gameId, shortCode }.
 */
export async function createGame(
  puzzleId: string,
  userId: string,
  options?: { multiplayer?: boolean; displayName?: string; spectator?: boolean },
): Promise<{ gameId: string; shortCode: string | null } | null> {
  if (!supabase) return null;

  const isMultiplayer = options?.multiplayer ?? false;
  const displayName = options?.displayName ?? "Player 1";

  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      puzzle_id: puzzleId,
      status: isMultiplayer ? "waiting" : "active",
    })
    .select("id, short_code")
    .single();

  if (gameError || !game) {
    console.error("Failed to create game:", gameError);
    return null;
  }

  if (!options?.spectator) {
    const { error: playerError } = await supabase.from("players").insert({
      game_id: game.id,
      user_id: userId,
      display_name: displayName,
      color: getPlayerColor(0),
    });

    if (playerError) {
      console.error("Failed to create player:", playerError);
    }
  }

  return { gameId: game.id, shortCode: game.short_code };
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

/**
 * Claim a cell on the server via the atomic claim_cell RPC.
 * Returns true if claim succeeded, false if already taken.
 */
export async function claimCellOnServer(
  gameId: string,
  cellKey: string,
  letter: string,
  playerId: string,
  correct: boolean,
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("claim_cell", {
    p_game_id: gameId,
    p_cell_key: cellKey,
    p_letter: letter,
    p_player_id: playerId,
    p_correct: correct,
  });

  if (error) {
    console.error("Failed to claim cell:", error);
    return false;
  }

  return data ?? false;
}

/**
 * Join a multiplayer game by short code.
 * Creates a player row and returns the game data + puzzle + players.
 */
export async function joinGame(
  shortCode: string,
  userId: string,
  displayName: string,
): Promise<{
  gameId: string;
  puzzleId: string;
  puzzle: Puzzle;
  players: Player[];
  cells: Record<string, CellState>;
  status: string;
} | null> {
  if (!supabase) return null;

  // Look up the game
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, puzzle_id, status, cells")
    .eq("short_code", shortCode.toUpperCase())
    .single();

  if (gameError || !game) {
    console.error("Game not found:", gameError);
    return null;
  }

  if (game.status !== "waiting" && game.status !== "active") {
    console.error("Game is not joinable, status:", game.status);
    return null;
  }

  // Get current players to determine color index
  const { data: existingPlayers } = await supabase
    .from("players")
    .select("*")
    .eq("game_id", game.id)
    .order("created_at");

  const players = existingPlayers ?? [];

  // Check if user already joined
  const alreadyJoined = players.find((p) => p.user_id === userId);
  if (!alreadyJoined) {
    const color = getPlayerColor(players.length);
    const { error: playerError } = await supabase.from("players").insert({
      game_id: game.id,
      user_id: userId,
      display_name: displayName,
      color,
    });

    if (playerError) {
      console.error("Failed to create player:", playerError);
      return null;
    }

    players.push({
      id: "",
      game_id: game.id,
      user_id: userId,
      display_name: displayName,
      color,
      score: 0,
      created_at: new Date().toISOString(),
    });
  }

  // Fetch the puzzle
  const { data: puzzleRow, error: puzzleError } = await supabase
    .from("puzzles")
    .select("*")
    .eq("id", game.puzzle_id)
    .single();

  if (puzzleError || !puzzleRow) {
    console.error("Failed to fetch puzzle:", puzzleError);
    return null;
  }

  const puzzle: Puzzle = {
    title: puzzleRow.title,
    author: puzzleRow.author,
    width: puzzleRow.width,
    height: puzzleRow.height,
    cells: puzzleRow.grid as Puzzle["cells"],
    clues: puzzleRow.clues as Puzzle["clues"],
  };

  const mappedPlayers: Player[] = players.map((p) => ({
    id: p.id,
    gameId: p.game_id,
    userId: p.user_id,
    displayName: p.display_name,
    color: p.color,
    score: p.score,
  }));

  return {
    gameId: game.id,
    puzzleId: game.puzzle_id,
    puzzle,
    players: mappedPlayers,
    cells: (game.cells as Record<string, CellState>) ?? {},
    status: game.status,
  };
}

/**
 * Fetch current game state (for reconnect / hydration).
 */
export async function fetchGameState(gameId: string): Promise<{
  cells: Record<string, CellState>;
  players: Player[];
  status: string;
} | null> {
  if (!supabase) return null;

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("cells, status")
    .eq("id", gameId)
    .single();

  if (gameError || !game) return null;

  const { data: playerRows } = await supabase
    .from("players")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at");

  const players: Player[] = (playerRows ?? []).map((p) => ({
    id: p.id,
    gameId: p.game_id,
    userId: p.user_id,
    displayName: p.display_name,
    color: p.color,
    score: p.score,
  }));

  return {
    cells: (game.cells as Record<string, CellState>) ?? {},
    players,
    status: game.status,
  };
}

/**
 * Rejoin a multiplayer game by game ID (for page refresh / reconnect).
 * Returns null if the game is closed/completed or doesn't exist.
 */
export async function rejoinGame(
  gameId: string,
  userId: string,
  displayName: string,
  options?: { spectator?: boolean },
): Promise<{
  gameId: string;
  puzzle: Puzzle;
  players: Player[];
  cells: Record<string, CellState>;
  status: string;
  shareCode: string | null;
} | null> {
  if (!supabase) return null;

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, puzzle_id, status, cells, short_code")
    .eq("id", gameId)
    .single();

  if (gameError || !game) return null;

  // Only rejoin waiting or active games
  if (game.status !== "waiting" && game.status !== "active") return null;

  // Fetch puzzle
  const { data: puzzleRow, error: puzzleError } = await supabase
    .from("puzzles")
    .select("*")
    .eq("id", game.puzzle_id)
    .single();

  if (puzzleError || !puzzleRow) return null;

  const puzzle: Puzzle = {
    title: puzzleRow.title,
    author: puzzleRow.author,
    width: puzzleRow.width,
    height: puzzleRow.height,
    cells: puzzleRow.grid as Puzzle["cells"],
    clues: puzzleRow.clues as Puzzle["clues"],
  };

  // Get current players
  const { data: existingPlayers } = await supabase
    .from("players")
    .select("*")
    .eq("game_id", game.id)
    .order("created_at");

  const players = existingPlayers ?? [];

  // Ensure player row exists (handles rare session-loss case where
  // anonymous auth gave a new user_id). Spectators skip this.
  if (!options?.spectator) {
    const alreadyJoined = players.find((p) => p.user_id === userId);
    if (!alreadyJoined) {
      const color = getPlayerColor(players.length);
      const { data: newPlayer, error: playerError } = await supabase
        .from("players")
        .insert({
          game_id: game.id,
          user_id: userId,
          display_name: displayName,
          color,
        })
        .select("*")
        .single();

      if (playerError) {
        console.error("Failed to create player on rejoin:", playerError);
      } else if (newPlayer) {
        players.push(newPlayer);
      }
    }
  }

  const mappedPlayers: Player[] = players.map((p) => ({
    id: p.id,
    gameId: p.game_id,
    userId: p.user_id,
    displayName: p.display_name,
    color: p.color,
    score: p.score,
  }));

  return {
    gameId: game.id,
    puzzle,
    players: mappedPlayers,
    cells: (game.cells as Record<string, CellState>) ?? {},
    status: game.status,
    shareCode: game.short_code,
  };
}

/**
 * Create a new game in the same room (reuse short_code).
 * Nulls the old game's short_code, then creates a new game with the same code.
 */
export async function createNextGame(
  puzzleId: string,
  userId: string,
  shortCode: string,
  options?: { displayName?: string; spectator?: boolean },
): Promise<{ gameId: string; shortCode: string } | null> {
  if (!supabase) return null;

  // Release the short_code from the old game
  await supabase
    .from("games")
    .update({ short_code: null })
    .eq("short_code", shortCode);

  // Create new game with the same short_code (trigger preserves explicit codes)
  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      puzzle_id: puzzleId,
      status: "waiting",
      short_code: shortCode,
    })
    .select("id, short_code")
    .single();

  if (gameError || !game) {
    console.error("Failed to create next game:", gameError);
    return null;
  }

  if (!options?.spectator) {
    const { error: playerError } = await supabase.from("players").insert({
      game_id: game.id,
      user_id: userId,
      display_name: options?.displayName ?? "Player 1",
      color: getPlayerColor(0),
    });

    if (playerError) {
      console.error("Failed to create player:", playerError);
    }
  }

  return { gameId: game.id, shortCode: game.short_code ?? shortCode };
}

/**
 * Start a multiplayer game (host only).
 */
export async function startGame(gameId: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from("games")
    .update({ status: "active" })
    .eq("id", gameId);

  if (error) {
    console.error("Failed to start game:", error);
    return false;
  }

  return true;
}
