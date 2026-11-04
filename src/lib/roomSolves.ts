import { supabase } from "./supabaseClient";

/**
 * Which of a room's players have finished its puzzle before (migration
 * 20261104200000, the `room_solves` RPC): the host or any player of the room
 * may ask; the answer is the mode of each player's latest finish, never a
 * time. An anonymous player keeps finishes on the device and is never listed.
 */
export interface PriorSolve {
  mode: string;
}

export async function fetchRoomSolves(gameId: string, puzzleKey: string): Promise<Record<string, PriorSolve>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("room_solves", { p_game_id: gameId, p_puzzle_key: puzzleKey });
  if (error) throw new Error(error.message);
  const out: Record<string, PriorSolve> = {};
  for (const row of (data ?? []) as { user_id: string; mode: string }[]) out[row.user_id] = { mode: row.mode };
  return out;
}

/** The chip a prior finish earns in a lobby's roster: solved on their own, or raced in a room. */
export function priorSolveChip(solve: PriorSolve | undefined): "solved" | "raced" | null {
  if (!solve || solve.mode === "import") return null;
  return solve.mode === "solo" ? "solved" : "raced";
}
