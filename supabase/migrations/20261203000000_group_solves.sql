-- Group solves (2026-11-19): which of a set of people have finished which of a
-- list of puzzles.
--
-- A host choosing a puzzle for a room wants ones nobody there has solved
-- (Andrew, 2026-11-19). `room_solves` and `friend_solves` answer for one puzzle;
-- this is the same narrow read across accounts for many: the caller names the
-- puzzles (keys they already hold, from the dailies index or a browse list), so
-- the answer never lists anything they did not ask about. Never a time, never
-- the letters.
--
-- The people: the caller; with p_game_id, that room's host, players and the
-- friends invited to it (the caller must be its host or a player); with
-- p_friend_ids, those of them who are the caller's accepted friends with no
-- block either way (anyone else named is dropped, not refused). The same
-- answer serves "none of us has solved it", "they have and I have not" and
-- "we all have": the caller filters.
--
-- A finish is any row but an untimed `import` (a streak-day marker); a timed
-- import is a real solve from before sign-in. Anonymous players keep finishes
-- on the device and never appear. The privacy policy's game-data item names
-- this read.

CREATE OR REPLACE FUNCTION public.group_solves(p_game_id UUID, p_friend_ids UUID[], p_puzzle_keys TEXT[])
RETURNS TABLE (puzzle_key TEXT, user_id UUID)
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
  IF coalesce(cardinality(p_puzzle_keys), 0) > 500 OR coalesce(cardinality(p_friend_ids), 0) > 100 THEN
    RAISE EXCEPTION 'group_solves:too_many';
  END IF;
  -- Only the room's host or one of its players may ask about it.
  IF p_game_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM games g
    WHERE g.id = p_game_id
      AND (g.host_user_id = uid OR EXISTS (SELECT 1 FROM players p WHERE p.game_id = g.id AND p.user_id = uid))
  ) THEN
    RAISE EXCEPTION 'friends:not_a_member';
  END IF;
  RETURN QUERY
  WITH people AS (
    SELECT uid AS id
    UNION
    SELECT g.host_user_id FROM games g WHERE g.id = p_game_id AND g.host_user_id IS NOT NULL
    UNION
    SELECT p.user_id FROM players p WHERE p.game_id = p_game_id AND p.user_id IS NOT NULL
    UNION
    SELECT i.to_user_id FROM room_invites i WHERE i.kind = 'room' AND i.game_id = p_game_id
    UNION
    SELECT f.id
    FROM unnest(coalesce(p_friend_ids, '{}'::UUID[])) AS f(id)
    WHERE EXISTS (
        SELECT 1 FROM friendships fr
        WHERE fr.status = 'accepted'
          AND ((fr.requester_id = uid AND fr.recipient_id = f.id) OR (fr.recipient_id = uid AND fr.requester_id = f.id))
      )
      AND NOT friends_blocked(uid, f.id)
  )
  SELECT DISTINCT s.puzzle_key, s.user_id
  FROM solves s
  JOIN people ON people.id = s.user_id
  WHERE s.puzzle_key = ANY (coalesce(p_puzzle_keys, '{}'::TEXT[]))
    AND (s.mode <> 'import' OR s.seconds IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.group_solves(UUID, UUID[], TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.group_solves(UUID, UUID[], TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.group_solves(UUID, UUID[], TEXT[]) TO authenticated, service_role;
