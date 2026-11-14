-- A hidden profile's board times are its own to see (Andrew, 2026-11-13): the
-- screenshot accounts need daily_results rows for their stats pages, and no
-- player should meet them on a leaderboard. Everyone else's rows stay public.
-- The check is a SECURITY DEFINER function because a hidden profile is, by its
-- own policy, unreadable to the caller asking about it.

CREATE OR REPLACE FUNCTION is_hidden_user(p_user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user AND hidden);
$$;

DROP POLICY IF EXISTS "Anyone can read daily results" ON daily_results;
CREATE POLICY "Anyone can read daily results"
  ON daily_results FOR SELECT
  USING (auth.uid() = user_id OR NOT is_hidden_user(user_id));
