-- claim_cell records when each square was claimed (Andrew, 2026-11-14: the
-- room's replay after a race).
--
-- A claimed cell in games.cells was { letter, correct, playerId }. Each
-- device stamps its own copy with the moment the claim arrived, which is
-- enough to replay the game on a device that watched all of it, but a player
-- who rejoined, a tab that re-hydrated, and the TV after a refresh read the
-- cells back from here and had no times at all. The cell now also carries
-- `at`: the server's clock in epoch milliseconds, the same unit the clients
-- use (CellState.at), so one clock orders the whole game.
--
-- Nothing else changes: same signature, same checks, same answer, so older
-- app builds keep working and simply ignore the field. Games claimed before
-- this migration have no times; the replay is not offered for them unless
-- the device saw every square land.

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
    jsonb_build_object(
      'letter', p_letter,
      'correct', true,
      'playerId', p_player_id,
      'at', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
    )
  )
  WHERE id = p_game_id;

  -- Update player score
  UPDATE players
  SET score = score + 1
  WHERE game_id = p_game_id AND user_id = p_player_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
