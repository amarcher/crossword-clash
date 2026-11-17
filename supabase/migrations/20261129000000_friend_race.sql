-- The race (Andrew, 2026-11-16): a puzzle's recorded solves by the caller's
-- friends, played together as if all had started at once: who had how much
-- filled when, and who settled each square first.
--
-- Free to watch ("Free to watch, Plus to race"): racing a recording live, and
-- watching a non-friend's, stay with solve_trace (Plus). This returns
-- accepted friends only, under each friend's own setting (races_visible:
-- nothing from "No one", nothing across a block), the fastest 11, in one
-- call. Letters follow solve_trace's rule: stripped to 1 (filled) /
-- 0 (emptied) unless the caller has finished this puzzle themselves.
CREATE OR REPLACE FUNCTION public.friend_race(p_puzzle_key TEXT)
RETURNS TABLE (user_id UUID, username TEXT, seconds INT, events JSONB, with_letters BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  finished BOOLEAN;
BEGIN
  finished := EXISTS (
    SELECT 1 FROM solves s WHERE s.user_id = uid AND s.puzzle_key = p_puzzle_key AND s.mode <> 'import'
  );
  RETURN QUERY
  SELECT t.user_id, p.username, t.seconds,
    CASE WHEN finished THEN t.events
    ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_array(e -> 0, e -> 1, CASE WHEN e ->> 2 = '' THEN 0 ELSE 1 END) ORDER BY n), '[]'::jsonb)
      FROM jsonb_array_elements(t.events) WITH ORDINALITY AS x(e, n)
    ) END,
    finished
  FROM solve_traces t
  JOIN profiles p ON p.user_id = t.user_id
  WHERE t.puzzle_key = p_puzzle_key
    AND races_are_friends(uid, t.user_id)
    AND races_visible(uid, t.user_id)
  ORDER BY t.seconds, t.user_id
  LIMIT 11;
END;
$$;
REVOKE ALL ON FUNCTION public.friend_race(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.friend_race(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.friend_race(TEXT) TO authenticated, service_role;
