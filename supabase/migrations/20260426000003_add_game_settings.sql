-- Persist per-game settings (currently just wrongAnswerTimeoutSeconds) so
-- a backgrounded player who missed the `game_started` broadcast can recover
-- the lockout duration on reconnect via fetchGameState/hydrate.
-- See ITEM-011 / ITEM-014.

ALTER TABLE games ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
