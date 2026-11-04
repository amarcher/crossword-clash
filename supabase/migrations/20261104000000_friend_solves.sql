-- Friends' solves (docs/friends-spec.md §3.8, 2026-11-04).
--
-- Inviting a friend to a room is awkward without knowing whether they have
-- already solved its puzzle (Andrew, 2026-11-03). `solves` rows are owner-only
-- under RLS, so this is the one read across accounts: for the caller's
-- accepted friends, whether each has a row for the puzzle and in which mode
-- (a shared-grid race finish is its own kind of solve). Never a time, never
-- the letters, never anyone but an accepted friend, and nothing across a
-- block in either direction. One row per friend, their latest finish of it;
-- `import` rows (local history uploaded on first sign-in) are not finishes.

CREATE OR REPLACE FUNCTION public.friend_solves(p_puzzle_key TEXT)
RETURNS TABLE (user_id UUID, mode TEXT, completed_day DATE)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (s.user_id) s.user_id, s.mode, s.completed_day
  FROM solves s
  JOIN friendships f
    ON f.status = 'accepted'
   AND ((f.requester_id = uid AND f.recipient_id = s.user_id) OR (f.recipient_id = uid AND f.requester_id = s.user_id))
  WHERE s.puzzle_key = p_puzzle_key
    AND s.user_id <> uid
    AND s.mode <> 'import'
    AND NOT friends_blocked(uid, s.user_id)
  ORDER BY s.user_id, s.completed_day DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.friend_solves(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_solves(TEXT) TO authenticated, service_role;
