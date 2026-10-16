-- Play insights, second pass: what the admin "Puzzle insights" panel needs.
--
-- 1. play_sessions learns whether the player was signed in (an account, not
--    the anonymous default) and which platform they played on ("iOS Safari",
--    "Android app", "macOS Chrome"…; `client` stays the coarse web/ios/android).
-- 2. narrator_sessions — one row per attempt to start the TV game-show host,
--    with the engine asked for, the one that answered, and the outcome.
-- 3. Two aggregate functions the studio-insights edge function calls with the
--    service role: per-puzzle opens / attempts / solves / platforms / narrator,
--    and per-clue timing and wrong letters for one puzzle. Both are
--    SECURITY DEFINER and revoked from anon and authenticated, so RLS on the
--    underlying tables (players see only their own rows) stays the only
--    direct path.
ALTER TABLE play_sessions
  ADD COLUMN IF NOT EXISTS signed_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS narrator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  game_id UUID,
  -- soloStats.puzzleIdentity() of the puzzle on the TV, to join with play_sessions.
  puzzle_key TEXT NOT NULL DEFAULT '',
  puzzle_title TEXT NOT NULL DEFAULT '',
  -- 'claude' | 'elevenlabs-agent' | 'openai-agent'
  requested_engine TEXT NOT NULL,
  engine TEXT NOT NULL,
  -- 'connected' | 'failed' | 'budget'
  outcome TEXT NOT NULL CHECK (outcome IN ('connected', 'failed', 'budget')),
  error TEXT NOT NULL DEFAULT '',
  client TEXT NOT NULL DEFAULT 'web',
  platform TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(error) <= 500)
);
CREATE INDEX IF NOT EXISTS narrator_sessions_created_idx ON narrator_sessions (created_at);
CREATE INDEX IF NOT EXISTS narrator_sessions_puzzle_idx ON narrator_sessions (puzzle_key, created_at);
ALTER TABLE narrator_sessions ENABLE ROW LEVEL SECURITY;

-- Hosts write their own rows; nobody reads them directly (aggregates below).
CREATE POLICY "Users insert own narrator sessions"
  ON narrator_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Per puzzle, in a window: how many visits, how many did something, how many
-- finished, the median active time of a finish, the split by mode / client /
-- platform / source, how many were signed in, and how the narrator fared on
-- TVs showing it. Ordered by visits.
CREATE OR REPLACE FUNCTION insights_puzzles(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  puzzle_key TEXT,
  puzzle_title TEXT,
  width SMALLINT,
  height SMALLINT,
  opens BIGINT,
  attempted BIGINT,
  solves BIGINT,
  median_active_seconds INTEGER,
  solo BIGINT,
  multiplayer BIGINT,
  signed_in BIGINT,
  by_client JSONB,
  by_platform JSONB,
  by_source JSONB,
  narrator_connected BIGINT,
  narrator_failed BIGINT,
  last_played TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT * FROM play_sessions WHERE started_at >= p_from AND started_at < p_to
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
    WHERE n.created_at >= p_from AND n.created_at < p_to
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
$$;

-- Per clue of one puzzle, in a window: how often it was focused, how often it
-- got solved, how long a solve took from first focus (average and median),
-- wrong letters typed into it, letters that came from crossings or other
-- players, and focuses that never led to a solve.
CREATE OR REPLACE FUNCTION insights_clues(p_puzzle_key TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  clue TEXT,
  letters INTEGER,
  attempts BIGINT,
  solves BIGINT,
  avg_solve_seconds NUMERIC,
  median_solve_seconds NUMERIC,
  wrong_letters BIGINT,
  crossing_letters BIGINT,
  unsolved BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION insights_puzzles(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION insights_clues(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
