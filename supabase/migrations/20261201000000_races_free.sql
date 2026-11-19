-- Racing and watching a recorded solve are free (Andrew, 2026-11-19).
--
-- 20261112000000 kept both for Plus: solve_trace refused a caller without the
-- entitlement, and race_candidates withheld everyone's times from them. One
-- Play button now asks every player how they want to play, a finished solve
-- to race among the answers, so neither asks about Plus any more.
--
-- Unchanged: who may see whose recording (races_visible, the owner's
-- setting), and letters only for a caller who has finished the puzzle. The
-- Daily Plus stays Plus where it always was: its puzzle (bonus_puzzles RLS)
-- and its letters (friend_race, 20261130000000).
--
-- Signatures are unchanged, so a client from before this migration keeps
-- working: it never asked for a free player.
--
-- Deploy: `npx supabase db push`, before the client that offers races to
-- everyone; until then a free player's race is refused and says so.

CREATE OR REPLACE FUNCTION public.race_candidates(p_puzzle_key TEXT)
RETURNS TABLE (user_id UUID, username TEXT, seconds INT, friend BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
BEGIN
  RETURN QUERY
  WITH visible AS (
    SELECT t.user_id, p.username, t.seconds, races_are_friends(uid, t.user_id) AS friend
    FROM solve_traces t
    JOIN profiles p ON p.user_id = t.user_id
    WHERE t.puzzle_key = p_puzzle_key
      AND races_visible(uid, t.user_id)
  )
  SELECT v.user_id, v.username, v.seconds, v.friend
  FROM (
    SELECT * FROM visible WHERE visible.friend
    UNION ALL
    (SELECT * FROM visible WHERE NOT visible.friend ORDER BY visible.seconds LIMIT 10)
  ) v
  ORDER BY v.friend DESC, v.seconds;
END;
$$;

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
