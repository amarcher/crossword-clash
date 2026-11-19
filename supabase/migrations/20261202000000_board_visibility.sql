-- The leaderboard is coupled to who may watch a solve (Andrew, 2026-11-19):
-- being on a board means your finished solve can be watched and raced, so the
-- board is always a list of people to race and a time comes with its proof.
--
--   race_visibility   on the board for        may post
--   'everyone'        everyone                yes
--   'friends'         the owner's friends     yes
--   'hidden'          nobody but the owner    no
--
-- An account is required to post: an anonymous session cannot. Rows posted
-- before this (by players with no profile) stay as they are, readable by all.
-- The Daily Plus board is the same table (slot 'bonus') and follows the same
-- rule. A profile hidden by an admin (profiles.hidden) stays off every board.
--
-- Both checks are SECURITY DEFINER: the caller cannot read another player's
-- profile setting or friendships directly.

CREATE OR REPLACE FUNCTION public.board_row_visible(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth.uid() = p_owner, false)
    OR COALESCE(
      (
        SELECT NOT p.hidden
          AND (
            p.race_visibility = 'everyone'
            OR (p.race_visibility = 'friends' AND auth.uid() IS NOT NULL AND races_are_friends(auth.uid(), p_owner))
          )
        FROM profiles p
        WHERE p.user_id = p_owner
      ),
      -- No profile: a row from before an account was required.
      true
    );
$$;

CREATE OR REPLACE FUNCTION public.board_can_post()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.race_visibility = 'hidden');
$$;

REVOKE ALL ON FUNCTION public.board_row_visible(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.board_row_visible(UUID) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.board_can_post() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.board_can_post() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can read daily results" ON daily_results;
CREATE POLICY "Anyone can read daily results"
  ON daily_results FOR SELECT
  USING (board_row_visible(user_id));

DROP POLICY IF EXISTS "Users insert own daily results" ON daily_results;
CREATE POLICY "Users insert own daily results"
  ON daily_results FOR INSERT
  WITH CHECK (auth.uid() = user_id AND board_can_post() AND (slot <> 'bonus' OR has_entitlement(auth.uid(), 'plus')));

DROP POLICY IF EXISTS "Users update own daily results" ON daily_results;
CREATE POLICY "Users update own daily results"
  ON daily_results FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND board_can_post() AND (slot <> 'bonus' OR has_entitlement(auth.uid(), 'plus')));
