-- Races and replays of recorded solves (docs/plus-expansion-spec.md §2, 2026-11-12).
--
-- A finished solo solve by an account is recorded letter by letter so another
-- player can race it later (the same puzzle, the recording advancing on the
-- racer's clock) or watch it replayed. Every race and replay is Plus. While
-- the racer hasn't finished the puzzle, a recording comes back with its
-- letters stripped (only which square was filled or emptied, and when), so a
-- ghost can never feed answers to someone solving; once the racer has a
-- finish of their own, the letters come back too, for the replay.

-- Who may race or replay the account's recorded solves (Andrew, 2026-11-12):
-- 'everyone' (any Plus player; the default), 'friends' (accepted friends
-- only) or 'hidden'. Profiles are public, and this setting is harmless there.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS race_visibility TEXT NOT NULL DEFAULT 'everyone'
  CHECK (race_visibility IN ('everyone', 'friends', 'hidden'));

-- One recording per account and puzzle: the fastest finish replaces a slower one.
-- `events` is [[ms, cell, letter], …]: ms of active solving time, the cell's
-- index (row * width + col), and the letter written, '' for an erase.
CREATE TABLE IF NOT EXISTS solve_traces (
  user_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  puzzle_key TEXT NOT NULL CHECK (char_length(puzzle_key) BETWEEN 1 AND 64),
  seconds INT NOT NULL CHECK (seconds >= 0),
  events JSONB NOT NULL CHECK (jsonb_typeof(events) = 'array' AND jsonb_array_length(events) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_key)
);

ALTER TABLE solve_traces ENABLE ROW LEVEL SECURITY;

-- The owner reads and deletes their own; writes go through save_solve_trace,
-- and others read through solve_trace (Plus, under the owner's race_visibility).
CREATE POLICY "Accounts read own traces" ON solve_traces FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Accounts delete own traces" ON solve_traces FOR DELETE USING (auth.uid() = user_id);

-- Keep a finished solve's recording, unless one at least as fast is already
-- kept. Accounts with a username only (a recording is credited by name).
CREATE OR REPLACE FUNCTION public.save_solve_trace(p_puzzle_key TEXT, p_seconds INT, p_events JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
BEGIN
  IF p_seconds IS NULL OR p_seconds < 0 OR jsonb_typeof(p_events) <> 'array'
     OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 4000
     OR octet_length(p_events::text) > 65536 THEN
    RAISE EXCEPTION 'races:bad_trace';
  END IF;
  INSERT INTO solve_traces AS t (user_id, puzzle_key, seconds, events)
  VALUES (uid, p_puzzle_key, p_seconds, p_events)
  ON CONFLICT (user_id, puzzle_key) DO UPDATE
    SET seconds = EXCLUDED.seconds, events = EXCLUDED.events, created_at = now()
    WHERE EXCLUDED.seconds < t.seconds;
  RETURN FOUND;
END;
$$;

-- Whether p_friend is an accepted, unblocked friend of uid.
CREATE OR REPLACE FUNCTION public.races_are_friends(uid UUID, p_friend UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT uid <> p_friend
    AND EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = uid AND f.recipient_id = p_friend) OR (f.recipient_id = uid AND f.requester_id = p_friend))
    )
    AND NOT friends_blocked(uid, p_friend);
$$;

-- Whether uid may race or replay p_user's recordings under p_user's setting
-- (nothing across a block, in either direction).
CREATE OR REPLACE FUNCTION public.races_visible(uid UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT uid <> p_user
    AND NOT friends_blocked(uid, p_user)
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = p_user
        AND (p.race_visibility = 'everyone' OR (p.race_visibility = 'friends' AND races_are_friends(uid, p_user)))
    );
$$;

-- Whose recording of this puzzle the caller can race: every friend who allows
-- it, then the fastest of everyone else who allows anyone (up to 10). Times
-- come back only to Plus (the rows are what the free Race button shows,
-- before the pitch).
CREATE OR REPLACE FUNCTION public.race_candidates(p_puzzle_key TEXT)
RETURNS TABLE (user_id UUID, username TEXT, seconds INT, friend BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  plus BOOLEAN := has_entitlement(uid, 'plus');
BEGIN
  RETURN QUERY
  WITH visible AS (
    SELECT t.user_id, p.username, t.seconds, races_are_friends(uid, t.user_id) AS friend
    FROM solve_traces t
    JOIN profiles p ON p.user_id = t.user_id
    WHERE t.puzzle_key = p_puzzle_key
      AND races_visible(uid, t.user_id)
  )
  SELECT v.user_id, v.username, CASE WHEN plus THEN v.seconds END, v.friend
  FROM (
    SELECT * FROM visible WHERE visible.friend
    UNION ALL
    (SELECT * FROM visible WHERE NOT visible.friend ORDER BY visible.seconds LIMIT 10)
  ) v
  ORDER BY v.friend DESC, v.seconds;
END;
$$;

-- A recording to race or replay (Plus). Letters are stripped to 1 (filled) /
-- 0 (emptied) unless the caller has finished this puzzle themselves.
CREATE OR REPLACE FUNCTION public.solve_trace(p_user UUID, p_puzzle_key TEXT)
RETURNS TABLE (seconds INT, events JSONB, with_letters BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  finished BOOLEAN;
BEGIN
  IF NOT has_entitlement(uid, 'plus') THEN
    RAISE EXCEPTION 'races:plus_required';
  END IF;
  IF NOT races_visible(uid, p_user) THEN
    RAISE EXCEPTION 'races:not_available';
  END IF;
  finished := EXISTS (
    SELECT 1 FROM solves s WHERE s.user_id = uid AND s.puzzle_key = p_puzzle_key AND s.mode <> 'import'
  );
  RETURN QUERY
  SELECT t.seconds,
    CASE WHEN finished THEN t.events
    ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_array(e -> 0, e -> 1, CASE WHEN e ->> 2 = '' THEN 0 ELSE 1 END) ORDER BY n), '[]'::jsonb)
      FROM jsonb_array_elements(t.events) WITH ORDINALITY AS x(e, n)
    ) END,
    finished
  FROM solve_traces t
  WHERE t.user_id = p_user AND t.puzzle_key = p_puzzle_key;
END;
$$;

REVOKE ALL ON FUNCTION public.save_solve_trace(TEXT, INT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_solve_trace(TEXT, INT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_solve_trace(TEXT, INT, JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.races_are_friends(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.races_visible(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.race_candidates(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.race_candidates(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.race_candidates(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.solve_trace(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.solve_trace(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.solve_trace(UUID, TEXT) TO authenticated, service_role;

-- Recordings are kept a year.
CREATE OR REPLACE FUNCTION public.solve_traces_sweep() RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n INT;
BEGIN
  DELETE FROM solve_traces WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.solve_traces_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'solve-traces-sweep') THEN
    PERFORM cron.unschedule('solve-traces-sweep');
  END IF;
END
$$;

-- After the other nightly sweeps (04:17, :27, :37, :47, :57 UTC).
SELECT cron.schedule('solve-traces-sweep', '7 5 * * *', $$SELECT public.solve_traces_sweep()$$);
