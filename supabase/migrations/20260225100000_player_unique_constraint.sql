-- Prevent duplicate player rows for the same user in a game
ALTER TABLE players ADD CONSTRAINT players_game_user_unique UNIQUE (game_id, user_id);

-- Allow 'closed' as a valid game status (needed by closeRoom)
ALTER TABLE games DROP CONSTRAINT games_status_check;
ALTER TABLE games ADD CONSTRAINT games_status_check CHECK (status IN ('waiting', 'active', 'completed', 'closed'));
