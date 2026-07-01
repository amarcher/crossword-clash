import { supabase } from "./supabaseClient";
import { emitToast } from "./toastBus";
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

  // Reuse existing puzzle row when the same file is re-uploaded.
  // Re-normalize-on-upload was removed alongside the puzzles RLS lockdown
  // (migration 20260426000002); apply normalizer fixes via a service-role
  // backfill if needed.
  if (fileHash) {
    const { data: existing } = await supabase
      .from("puzzles")
      .select("id")
      .eq("file_hash", fileHash)
      .single();

    if (existing) {
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
    emitToast({ message: "Could not save puzzle to the server.", severity: "error" });
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
      // host_user_id lets a TV-spectator host (no player row) still update
      // their own game under the post-ITEM-002 RLS policy.
      host_user_id: userId,
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

  await Promise.all([
    supabase
      .from("games")
      .update({
        cells,
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", gameId),
    supabase
      .from("players")
      .update({ score })
      .eq("game_id", gameId)
      .eq("user_id", userId),
  ]);
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
    emitToast({ message: `No game found with code ${shortCode.toUpperCase()}.`, severity: "error" });
    return null;
  }

  if (game.status !== "waiting" && game.status !== "active") {
    console.error("Game is not joinable, status:", game.status);
    emitToast({ message: "That game has already finished or been closed.", severity: "error" });
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
      race_seconds: null,
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
  settings: { wrongAnswerTimeoutSeconds?: number; raceMode?: string } | null;
  /** ms epoch when the host started the game, or null (still waiting). */
  startedAt: number | null;
  /** ms epoch when the grid was completed, or null. */
  completedAt: number | null;
} | null> {
  if (!supabase) return null;

  const [gameResult, playersResult] = await Promise.all([
    // select("*") tolerates schema drift: started_at ships in migration
    // 20260701000000 and simply reads as undefined until it's applied.
    supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single(),
    supabase
      .from("players")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at"),
  ]);

  const { data: game, error: gameError } = gameResult;
  if (gameError || !game) return null;

  const { data: playerRows } = playersResult;

  const players: Player[] = (playerRows ?? []).map((p) => ({
    id: p.id,
    gameId: p.game_id,
    userId: p.user_id,
    displayName: p.display_name,
    color: p.color,
    score: p.score,
    // Undefined before the 20260701 migration is applied — read as null.
    raceSeconds: typeof p.race_seconds === "number" ? p.race_seconds : null,
  }));

  return {
    cells: (game.cells as Record<string, CellState>) ?? {},
    players,
    status: game.status,
    settings:
      (game.settings as { wrongAnswerTimeoutSeconds?: number; raceMode?: string } | null) ?? null,
    startedAt: game.started_at ? Date.parse(game.started_at) : null,
    completedAt: game.completed_at ? Date.parse(game.completed_at) : null,
  };
}

/**
 * Persist an async-race finish time on the caller's own player row.
 * Best-effort: live clients get the time via broadcast; this write covers
 * rejoiners/late viewers. Never throws.
 */
export async function recordRaceFinish(
  gameId: string,
  userId: string,
  seconds: number,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("players")
    .update({ race_seconds: Math.max(0, Math.floor(seconds)) })
    .eq("game_id", gameId)
    .eq("user_id", userId);
  if (error) console.warn("Race finish not persisted:", error.message);
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

  // Fetch puzzle and players in parallel
  const [puzzleResult, playersResult] = await Promise.all([
    supabase
      .from("puzzles")
      .select("*")
      .eq("id", game.puzzle_id)
      .single(),
    supabase
      .from("players")
      .select("*")
      .eq("game_id", game.id)
      .order("created_at"),
  ]);

  if (puzzleResult.error || !puzzleResult.data) return null;
  const puzzleRow = puzzleResult.data;

  const puzzle: Puzzle = {
    title: puzzleRow.title,
    author: puzzleRow.author,
    width: puzzleRow.width,
    height: puzzleRow.height,
    cells: puzzleRow.grid as Puzzle["cells"],
    clues: puzzleRow.clues as Puzzle["clues"],
  };

  const players = playersResult.data ?? [];

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
      host_user_id: userId,
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
export async function startGame(
  gameId: string,
  settings?: { wrongAnswerTimeoutSeconds: number },
): Promise<boolean> {
  if (!supabase) return false;

  // Persist settings so reconnecting players recover the lockout duration
  // even if they missed the broadcast (see ITEM-011).
  const update: { status: string; settings?: object } = { status: "active" };
  if (settings) update.settings = settings;

  const { error } = await supabase
    .from("games")
    .update(update)
    .eq("id", gameId);

  if (error) {
    console.error("Failed to start game:", error);
    return false;
  }

  // Anchor the shared race clock for rejoiners. Separate, best-effort write so
  // starting a game can never fail on a DB that hasn't applied the
  // 20260701000000 migration yet — live clients get the clock via broadcast.
  void supabase
    .from("games")
    .update({ started_at: new Date().toISOString() })
    .eq("id", gameId)
    .then(({ error: raceClockError }) => {
      if (raceClockError) console.warn("Race clock not persisted:", raceClockError.message);
    });

  return true;
}
