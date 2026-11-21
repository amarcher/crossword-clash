-- The slowest clues for one kind of puzzle (Andrew, 2026-11-21: per daily, like
-- the rest of the stats page). my_slow_clues() is every puzzle together and
-- stays for clients from before this. A daily is a public file the server does
-- not hold, so the page names its slot's puzzles by key (p_keys, from the
-- published index); p_kind 'bonus' is the Daily Plus, whose keys the server has.

CREATE OR REPLACE FUNCTION public.my_slow_clues_for(p_since DATE, p_kind TEXT, p_keys TEXT[])
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
      AND CASE WHEN p_kind = 'bonus' THEN s.puzzle_key IN (SELECT b.identity FROM bonus_puzzles b)
               ELSE s.puzzle_key = ANY (coalesce(p_keys, '{}')) END
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



REVOKE ALL ON FUNCTION public.my_slow_clues_for(DATE, TEXT, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_slow_clues_for(DATE, TEXT, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_slow_clues_for(DATE, TEXT, TEXT[]) TO authenticated, service_role;
