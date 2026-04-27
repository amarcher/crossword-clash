-- Restore TV/spectator host's ability to close their own room.
--
-- Migration 20260426000002 tightened games UPDATE to "players in the game"
-- only, but the TV-spectator host is created with `spectator: true` (no
-- player row). That made closeRoom and the auto-completion update silently
-- no-op for spectator hosts.
--
-- Fix: track the creator on the games row and allow them to update too.
-- Existing games stay NULL and rely on the players-in-game branch of the
-- policy (regular hosts-as-player flows are unaffected).

ALTER TABLE games ADD COLUMN IF NOT EXISTS host_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_games_host_user_id ON games(host_user_id);

DROP POLICY IF EXISTS "Players in game can update games" ON games;

CREATE POLICY "Players or host can update games"
  ON games FOR UPDATE
  USING (
    host_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM players
      WHERE players.game_id = games.id
      AND players.user_id = auth.uid()
    )
  );
