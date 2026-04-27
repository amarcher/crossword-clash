-- Restrict games UPDATE to players actually in the game, and remove the
-- puzzles UPDATE policy entirely. Previously, any authenticated user
-- (including any anonymous-auth user) could:
--   - UPDATE games SET cells='{}', status='closed' for any in-flight game
--   - UPDATE puzzles SET grid='[]' to rewrite any puzzle's grid for everyone
--
-- The client-side puzzle re-normalize-on-upload path in puzzleService.ts
-- (uploadPuzzle's "if existing then update" branch) is removed in the
-- accompanying client commit; future normalizer fixes need a service-role
-- backfill, not client-driven mutation.

-- Drop overly-permissive games UPDATE policy
DROP POLICY IF EXISTS "Authenticated users can update games" ON games;

-- Only players in the game can update it. Edge functions use the service
-- role and bypass RLS, so server-side flows are unaffected.
CREATE POLICY "Players in game can update games"
  ON games FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.game_id = games.id
      AND players.user_id = auth.uid()
    )
  );

-- Drop puzzle UPDATE policy. Puzzles are immutable post-insert from
-- the client's perspective.
DROP POLICY IF EXISTS "Authenticated users can update puzzles" ON puzzles;
