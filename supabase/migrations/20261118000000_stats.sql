-- Deeper stats (docs/plus-expansion-spec.md §3; Andrew, 2026-11-12: the page
-- is Plus; free players see the cards with their figures blurred, drawn on
-- the client, so these functions return nothing to them).
--
-- Every function answers the caller about themselves, from rows that are
-- already theirs or already public: daily_results (the boards, public),
-- friendships (theirs) and play_sessions (theirs). Each checks Plus itself.

-- Each daily the caller finished since p_since, with how many solvers of that
-- day and slot they beat: faster_than = slower results / other results (null
-- when they were the only one).
CREATE OR REPLACE FUNCTION public.my_daily_results(p_since DATE)
RETURNS TABLE (day DATE, slot TEXT, seconds INT, solvers INT, faster_than NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT has_entitlement(uid, 'plus') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT m.day, m.slot, m.seconds,
    (SELECT count(*)::int FROM daily_results o WHERE o.day = m.day AND o.slot = m.slot),
    (SELECT CASE WHEN count(*) <= 1 THEN NULL
       ELSE round(count(*) FILTER (WHERE o.seconds > m.seconds)::numeric / (count(*) - 1), 4) END
     FROM daily_results o WHERE o.day = m.day AND o.slot = m.slot)
  FROM daily_results m
  WHERE m.user_id = uid AND m.day >= coalesce(p_since, '-infinity'::date)
  ORDER BY m.day, m.slot;
END;
$$;

-- For each accepted friend: the dailies both finished since p_since, and who was faster.
CREATE OR REPLACE FUNCTION public.my_head_to_head(p_since DATE)
RETURNS TABLE (friend_id UUID, username TEXT, played INT, wins INT, losses INT, ties INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT has_entitlement(uid, 'plus') THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = uid THEN f.recipient_id ELSE f.requester_id END AS fid
    FROM friendships f
    WHERE f.status = 'accepted' AND (f.requester_id = uid OR f.recipient_id = uid)
  )
  SELECT fr.fid, p.username,
    count(*)::int,
    count(*) FILTER (WHERE me.seconds < them.seconds)::int,
    count(*) FILTER (WHERE me.seconds > them.seconds)::int,
    count(*) FILTER (WHERE me.seconds = them.seconds)::int
  FROM friends fr
  JOIN profiles p ON p.user_id = fr.fid
  JOIN daily_results them ON them.user_id = fr.fid AND them.day >= coalesce(p_since, '-infinity'::date)
  JOIN daily_results me ON me.user_id = uid AND me.day = them.day AND me.slot = them.slot
  GROUP BY fr.fid, p.username
  ORDER BY count(*) DESC, p.username;
END;
$$;

-- The caller's ten slowest clues since p_since: first focus to solved, from the
-- play sessions the apps (and web with analytics consent) record.
CREATE OR REPLACE FUNCTION public.my_slow_clues(p_since DATE)
RETURNS TABLE (puzzle_title TEXT, clue TEXT, seconds INT, played_on DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT has_entitlement(uid, 'plus') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.puzzle_title, c->>'k', ((c->>'s')::numeric - (c->>'f')::numeric)::int, s.started_at::date
  FROM play_sessions s, jsonb_array_elements(s.clues) c
  WHERE s.user_id = uid
    AND s.started_at >= coalesce(p_since, '-infinity'::date)
    AND jsonb_typeof(s.clues) = 'array'
    AND c ? 'f' AND c ? 's'
    AND (c->>'s')::numeric > (c->>'f')::numeric
  ORDER BY ((c->>'s')::numeric - (c->>'f')::numeric) DESC
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.my_daily_results(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_head_to_head(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_slow_clues(DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_daily_results(DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_head_to_head(DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_slow_clues(DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_daily_results(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_head_to_head(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_slow_clues(DATE) TO authenticated, service_role;
