-- Slowest clues show the clue and its answer (Andrew, 2026-11-21), for every
-- puzzle the server holds. my_slow_clues() now also returns:
--   puzzle_key  the session's puzzle, so the page finds a daily exactly (it
--               matched by title before);
--   clue_text, answer
--               for a Daily Plus or a community puzzle, read from its stored
--               puzzle. Null for a daily (the page reads the public feed) and
--               for an import, which the server never holds.
-- Only solved clues are listed, so the answer is one the caller entered. The
-- function stays Plus-only. The return type changes, so it is dropped first;
-- a client from before this migration reads the first four columns as before.

DROP FUNCTION IF EXISTS public.my_slow_clues(DATE);

CREATE FUNCTION public.my_slow_clues(p_since DATE)
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
    SELECT s.puzzle_title AS t, c->>'k' AS k, ((c->>'s')::numeric - (c->>'f')::numeric)::int AS secs, s.started_at::date AS d, s.puzzle_key AS pk
    FROM play_sessions s, jsonb_array_elements(s.clues) c
    WHERE s.user_id = uid
      AND s.started_at >= coalesce(p_since, '-infinity'::date)
      AND jsonb_typeof(s.clues) = 'array'
      AND c ? 'f' AND c ? 's'
      AND (c->>'s')::numeric > (c->>'f')::numeric
    ORDER BY ((c->>'s')::numeric - (c->>'f')::numeric) DESC
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

REVOKE ALL ON FUNCTION public.my_slow_clues(DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_slow_clues(DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_slow_clues(DATE) TO authenticated, service_role;
