-- A clue's time is the time spent on it (Andrew, 2026-11-21: "some of these
-- numbers are really up there"). my_slow_clues() and my_slow_clue_count()
-- measured first look to solve (s - f), which counts the time spent on other
-- clues after skipping one, and time away: a three-letter answer read 24:47.
-- They now read `d`, the seconds the clue was selected before it was complete
-- (playInsights.ts, recorded since 2026-11-21). Sessions from before then have
-- no `d` and are left out, so both start again from that day.

CREATE OR REPLACE FUNCTION public.my_slow_clues(p_since DATE)
RETURNS TABLE (puzzle_title TEXT, clue TEXT, seconds INT, played_on DATE, puzzle_key TEXT, clue_text TEXT, answer TEXT)
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
  WITH slow AS (
    SELECT s.puzzle_title AS t, c->>'k' AS k, (c->>'d')::numeric::int AS secs, s.started_at::date AS d, s.puzzle_key AS pk
    FROM play_sessions s, jsonb_array_elements(s.clues) c
    WHERE s.user_id = uid
      AND s.started_at >= coalesce(p_since, '-infinity'::date)
      AND jsonb_typeof(s.clues) = 'array'
      AND c ? 'd' AND c ? 's'
      AND (c->>'d')::numeric > 0
    ORDER BY (c->>'d')::numeric DESC
    LIMIT 10
  )
  SELECT sl.t, sl.k, sl.secs, sl.d, sl.pk, w.txt, w.ans
  FROM slow sl
  LEFT JOIN LATERAL (
    SELECT p.puzzle FROM (
      SELECT b.puzzle FROM bonus_puzzles b WHERE b.identity = sl.pk
      UNION ALL
      SELECT cp.puzzle FROM community_puzzles cp WHERE cp.puzzle_key = sl.pk
    ) p LIMIT 1
  ) pz ON true
  LEFT JOIN LATERAL (
    -- A stored puzzle lists its clues as "37. Text" beside a parallel list of answers.
    SELECT regexp_replace(e.line, '^\d+\.\s*', '') AS txt,
           pz.puzzle->'answers'->(CASE WHEN right(sl.k, 1) = 'A' THEN 'across' ELSE 'down' END)->>((e.ord - 1)::int) AS ans
    FROM jsonb_array_elements_text(pz.puzzle->'clues'->(CASE WHEN right(sl.k, 1) = 'A' THEN 'across' ELSE 'down' END)) WITH ORDINALITY AS e(line, ord)
    WHERE e.line LIKE left(sl.k, length(sl.k) - 1) || '. %'
    LIMIT 1
  ) w ON pz.puzzle IS NOT NULL
  ORDER BY sl.secs DESC;
END;
$$;


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
      AND c ? 'd' AND c ? 's'
      AND (c->>'d')::numeric > slow_seconds
  );
END;
$$;
