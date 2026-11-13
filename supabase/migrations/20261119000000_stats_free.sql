-- Stats for free players (Andrew, 2026-11-13: the locked page drew invented
-- figures and blurred things a free account could already see). The page now
-- shows every player their own real times; Plus keeps what compares them with
-- others and where they struggle. So the functions answer every signed-in
-- caller (anonymous included, as daily_results holds their rows too) and
-- withhold only the Plus figures:
--
--   my_daily_results   everyone: day, slot, seconds, solvers (the board's own,
--                      public numbers); faster_than only for Plus.
--   my_head_to_head    everyone: the friend and the dailies in common;
--                      wins / losses / ties only for Plus.
--   my_slow_clues      Plus only, as before.
--   my_slow_clue_count everyone: how many clues took over a minute, never which.
--
-- Signatures are unchanged, so a client from before this migration keeps
-- working: its free page asked the server nothing.

CREATE OR REPLACE FUNCTION public.my_daily_results(p_since DATE)
RETURNS TABLE (day DATE, slot TEXT, seconds INT, solvers INT, faster_than NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  is_plus BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;
  is_plus := has_entitlement(uid, 'plus');
  RETURN QUERY
  SELECT m.day, m.slot, m.seconds,
    (SELECT count(*)::int FROM daily_results o WHERE o.day = m.day AND o.slot = m.slot),
    CASE WHEN NOT is_plus THEN NULL ELSE
      (SELECT CASE WHEN count(*) <= 1 THEN NULL
         ELSE round(count(*) FILTER (WHERE o.seconds > m.seconds)::numeric / (count(*) - 1), 4) END
       FROM daily_results o WHERE o.day = m.day AND o.slot = m.slot)
    END
  FROM daily_results m
  WHERE m.user_id = uid AND m.day >= coalesce(p_since, '-infinity'::date)
  ORDER BY m.day, m.slot;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_head_to_head(p_since DATE)
RETURNS TABLE (friend_id UUID, username TEXT, played INT, wins INT, losses INT, ties INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  is_plus BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;
  is_plus := has_entitlement(uid, 'plus');
  RETURN QUERY
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = uid THEN f.recipient_id ELSE f.requester_id END AS fid
    FROM friendships f
    WHERE f.status = 'accepted' AND (f.requester_id = uid OR f.recipient_id = uid)
  )
  SELECT fr.fid, p.username,
    count(*)::int,
    CASE WHEN is_plus THEN count(*) FILTER (WHERE me.seconds < them.seconds)::int END,
    CASE WHEN is_plus THEN count(*) FILTER (WHERE me.seconds > them.seconds)::int END,
    CASE WHEN is_plus THEN count(*) FILTER (WHERE me.seconds = them.seconds)::int END
  FROM friends fr
  JOIN profiles p ON p.user_id = fr.fid
  JOIN daily_results them ON them.user_id = fr.fid AND them.day >= coalesce(p_since, '-infinity'::date)
  JOIN daily_results me ON me.user_id = uid AND me.day = them.day AND me.slot = them.slot
  GROUP BY fr.fid, p.username
  ORDER BY count(*) DESC, p.username;
END;
$$;

-- How many of the caller's clues since p_since took over a minute, first focus
-- to solved: the free page's teaser for the slowest-clues card.
CREATE OR REPLACE FUNCTION public.my_slow_clue_count(p_since DATE)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  slow_seconds CONSTANT INT := 60;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN 0;
  END IF;
  RETURN (
    SELECT count(*)::int
    FROM play_sessions s, jsonb_array_elements(s.clues) c
    WHERE s.user_id = uid
      AND s.started_at >= coalesce(p_since, '-infinity'::date)
      AND jsonb_typeof(s.clues) = 'array'
      AND c ? 'f' AND c ? 's'
      AND (c->>'s')::numeric - (c->>'f')::numeric > slow_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_slow_clue_count(DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_slow_clue_count(DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_slow_clue_count(DATE) TO authenticated, service_role;
