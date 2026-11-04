-- Room solves (2026-11-04): which of a room's players have finished its puzzle before.
--
-- A host choosing a puzzle wants to know whether the people in the room have
-- already solved it (Andrew, 2026-11-03). `solves` rows are owner-only, so this
-- is a second narrow read across accounts, beside friend_solves: for the
-- players of a room the caller hosts or plays in, whether each has a row for
-- the room's puzzle and in which mode (a shared-grid race finish is its own
-- kind of solve). Never a time, never the letters, never an `import` row, one
-- row per player, their latest finish. Anonymous users may ask (a TV host is
-- usually one) but never appear in the answer (their finishes stay on the
-- device). The privacy policy's game-data item names this read.

CREATE OR REPLACE FUNCTION public.room_solves(p_game_id UUID, p_puzzle_key TEXT)
RETURNS TABLE (user_id UUID, mode TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'friends:not_signed_in';
  END IF;
  -- Only the room's host or one of its players may ask.
  IF NOT EXISTS (
    SELECT 1 FROM games g
    WHERE g.id = p_game_id
      AND (g.host_user_id = uid OR EXISTS (SELECT 1 FROM players p WHERE p.game_id = g.id AND p.user_id = uid))
  ) THEN
    RAISE EXCEPTION 'friends:not_a_member';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (s.user_id) s.user_id, s.mode
  FROM players p
  JOIN solves s ON s.user_id = p.user_id
  WHERE p.game_id = p_game_id
    AND s.puzzle_key = p_puzzle_key
    AND s.mode <> 'import'
  ORDER BY s.user_id, s.completed_day DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.room_solves(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.room_solves(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.room_solves(UUID, TEXT) TO authenticated, service_role;
