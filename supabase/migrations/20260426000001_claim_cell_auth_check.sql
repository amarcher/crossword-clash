-- Reject claim_cell calls where the caller spoofs another user's UID.
-- Without this guard, any authenticated client can pass another user's UUID
-- as p_player_id; the embedded `UPDATE players SET score` no-ops via RLS,
-- but `games.cells` still records the cell with the spoofed playerId,
-- attributing the claim (and badge) to the victim.

DROP FUNCTION IF EXISTS claim_cell(UUID, TEXT, TEXT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION claim_cell(
  p_game_id UUID,
  p_cell_key TEXT,
  p_letter TEXT,
  p_player_id UUID,
  p_correct BOOLEAN
)
RETURNS BOOLEAN AS $$
DECLARE
  current_cells JSONB;
  game_status TEXT;
BEGIN
  -- Reject if caller is not the player they claim to be
  IF auth.uid() IS NULL OR auth.uid() != p_player_id THEN
    RETURN FALSE;
  END IF;

  -- Lock the row and get current state
  SELECT cells, status INTO current_cells, game_status
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  -- Game must be active
  IF game_status != 'active' THEN
    RETURN FALSE;
  END IF;

  -- Cell must not already be claimed
  IF current_cells ? p_cell_key THEN
    RETURN FALSE;
  END IF;

  -- Only accept correct letters
  IF NOT p_correct THEN
    RETURN FALSE;
  END IF;

  -- Claim the cell
  UPDATE games
  SET cells = current_cells || jsonb_build_object(
    p_cell_key,
    jsonb_build_object('letter', p_letter, 'correct', true, 'playerId', p_player_id)
  )
  WHERE id = p_game_id;

  -- Update player score
  UPDATE players
  SET score = score + 1
  WHERE game_id = p_game_id AND user_id = p_player_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
