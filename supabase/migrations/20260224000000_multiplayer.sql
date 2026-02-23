-- Add short_code column for multiplayer game sharing
ALTER TABLE games ADD COLUMN short_code TEXT UNIQUE;

-- Generate a random 6-char alphanumeric code
CREATE OR REPLACE FUNCTION generate_short_code()
RETURNS TRIGGER AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INT;
BEGIN
  -- Only generate if not already set
  IF NEW.short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- Check uniqueness
    EXIT WHEN NOT EXISTS (SELECT 1 FROM games WHERE short_code = code);
  END LOOP;

  NEW.short_code := code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_generate_short_code
  BEFORE INSERT ON games
  FOR EACH ROW
  EXECUTE FUNCTION generate_short_code();

-- Atomic cell claim with row lock
-- Returns true if the cell was successfully claimed, false if already taken
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

-- Enable realtime for games and players tables
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
