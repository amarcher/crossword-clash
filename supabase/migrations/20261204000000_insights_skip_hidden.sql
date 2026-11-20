-- Studio insights leave out hidden profiles (Andrew, 2026-11-20).
--
-- The two test accounts (shots_free, shots_plus; profiles.hidden) are driven
-- through real puzzles to check builds and capture screenshots, and their
-- play_sessions rows counted as opens, attempts and solves: 39 sessions in 30
-- days for one of them, which made the numbers look better than they were.
-- Both functions are otherwise unchanged from production. CREATE OR REPLACE
-- keeps their privileges (revoked from anon and authenticated).

CREATE OR REPLACE FUNCTION public.insights_clues(p_puzzle_key text, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(clue text, letters integer, attempts bigint, solves bigint, avg_solve_seconds numeric, median_solve_seconds numeric, wrong_letters bigint, crossing_letters bigint, unsolved bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT
      e ->> 'k' AS clue,
      (e ->> 'n')::integer AS letters,
      (e ->> 'f')::numeric AS f,
      (e ->> 's')::numeric AS s,
      coalesce((e ->> 'w')::integer, 0) AS w,
      coalesce((e ->> 'x')::integer, 0) AS x
    FROM play_sessions ps, jsonb_array_elements(ps.clues) e
    WHERE ps.puzzle_key = p_puzzle_key AND ps.started_at >= p_from AND ps.started_at < p_to
      AND NOT is_hidden_user(ps.user_id)
  )
  SELECT
    c.clue,
    max(c.letters),
    count(*) FILTER (WHERE c.f IS NOT NULL),
    count(*) FILTER (WHERE c.s IS NOT NULL),
    avg(c.s - c.f) FILTER (WHERE c.s IS NOT NULL AND c.f IS NOT NULL AND c.s >= c.f),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (c.s - c.f)) FILTER (WHERE c.s IS NOT NULL AND c.f IS NOT NULL AND c.s >= c.f),
    sum(c.w),
    sum(c.x),
    count(*) FILTER (WHERE c.f IS NOT NULL AND c.s IS NULL)
  FROM c
  WHERE c.clue IS NOT NULL
  GROUP BY c.clue
  ORDER BY c.clue;
$function$;

CREATE OR REPLACE FUNCTION public.insights_puzzles(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(puzzle_key text, puzzle_title text, width smallint, height smallint, opens bigint, attempted bigint, solves bigint, median_active_seconds integer, solo bigint, multiplayer bigint, signed_in bigint, by_client jsonb, by_platform jsonb, by_source jsonb, narrator_connected bigint, narrator_failed bigint, last_played timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT * FROM play_sessions WHERE started_at >= p_from AND started_at < p_to AND NOT is_hidden_user(user_id)
  ),
  per AS (
    SELECT
      s.puzzle_key,
      (array_agg(s.puzzle_title ORDER BY s.started_at DESC))[1] AS puzzle_title,
      (array_agg(s.width ORDER BY s.started_at DESC))[1] AS width,
      (array_agg(s.height ORDER BY s.started_at DESC))[1] AS height,
      count(*) AS opens,
      count(*) FILTER (WHERE s.cells_filled > s.cells_at_start OR s.wrong_letters > 0 OR s.completed) AS attempted,
      count(*) FILTER (WHERE s.completed) AS solves,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.active_seconds) FILTER (WHERE s.completed) AS median_active,
      count(*) FILTER (WHERE s.mode = 'solo') AS solo,
      count(*) FILTER (WHERE s.mode <> 'solo') AS multiplayer,
      count(*) FILTER (WHERE s.signed_in) AS signed_in,
      max(s.started_at) AS last_played
    FROM s
    GROUP BY s.puzzle_key
  ),
  clients AS (
    SELECT c.puzzle_key, jsonb_object_agg(c.client, c.n) AS by_client
    FROM (SELECT s.puzzle_key, s.client, count(*) AS n FROM s GROUP BY 1, 2) c
    GROUP BY c.puzzle_key
  ),
  platforms AS (
    SELECT p.puzzle_key, jsonb_object_agg(coalesce(nullif(p.platform, ''), 'unknown'), p.n) AS by_platform
    FROM (SELECT s.puzzle_key, s.platform, count(*) AS n FROM s GROUP BY 1, 2) p
    GROUP BY p.puzzle_key
  ),
  sources AS (
    SELECT q.puzzle_key, jsonb_object_agg(q.source, q.n) AS by_source
    FROM (SELECT s.puzzle_key, s.source, count(*) AS n FROM s GROUP BY 1, 2) q
    GROUP BY q.puzzle_key
  ),
  narr AS (
    SELECT
      n.puzzle_key,
      count(*) FILTER (WHERE n.outcome = 'connected') AS connected,
      count(*) FILTER (WHERE n.outcome <> 'connected') AS failed
    FROM narrator_sessions n
    WHERE n.created_at >= p_from AND n.created_at < p_to AND NOT is_hidden_user(n.user_id)
    GROUP BY n.puzzle_key
  )
  SELECT
    per.puzzle_key,
    per.puzzle_title,
    per.width,
    per.height,
    per.opens,
    per.attempted,
    per.solves,
    per.median_active::integer,
    per.solo,
    per.multiplayer,
    per.signed_in,
    coalesce(clients.by_client, '{}'::jsonb),
    coalesce(platforms.by_platform, '{}'::jsonb),
    coalesce(sources.by_source, '{}'::jsonb),
    coalesce(narr.connected, 0),
    coalesce(narr.failed, 0),
    per.last_played
  FROM per
  LEFT JOIN clients ON clients.puzzle_key = per.puzzle_key
  LEFT JOIN platforms ON platforms.puzzle_key = per.puzzle_key
  LEFT JOIN sources ON sources.puzzle_key = per.puzzle_key
  LEFT JOIN narr ON narr.puzzle_key = per.puzzle_key
  ORDER BY per.opens DESC, per.last_played DESC;
$function$;
