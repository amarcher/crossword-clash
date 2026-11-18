-- Daily Plus links work as the other puzzles' do (Andrew, 2026-11-18: "we
-- shouldn't have these restrictions on Daily Plus links"), with one rule: a
-- viewer without Plus only ever sees squares filling, never letters.
--
-- 1. race_replies takes a Daily Plus day (slot 'bonus', as daily_results
--    does), so the sender of a /bonus/:day link hears how a race went.
--    reply_to_race itself is unchanged: it stores the day and slot it is given.
-- 2. send_beat takes a Daily Plus link (/bonus/YYYY-MM-DD?beat=…&by=…&r=…)
--    for a released day, besides a daily's and a community puzzle's.
-- 3. friend_race returns a Daily Plus recording's letters only to a caller
--    who has Plus as well as a finish of their own. `solves` rows are written
--    by the account itself and a bonus's identity is public (bonus_cards), so
--    a finish alone must not be what unlocks the letters of a Plus-only puzzle.
--    (solve_trace already requires Plus for any puzzle.)

ALTER TABLE race_replies DROP CONSTRAINT IF EXISTS race_replies_slot_check;
ALTER TABLE race_replies ADD CONSTRAINT race_replies_slot_check CHECK (slot IN ('mini', 'midi', 'large', 'bonus'));

CREATE OR REPLACE FUNCTION public.send_beat(p_friend UUID, p_link TEXT) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  invite_id UUID;
  short TEXT;
  bonus_day TEXT;
BEGIN
  -- Only the site's own challenge paths, so an invite can never carry an arbitrary link:
  -- a day's daily, a published community puzzle, or a released Daily Plus day.
  IF p_link IS NULL THEN
    RAISE EXCEPTION 'friends:invalid';
  END IF;
  IF p_link !~ '^/daily/\d{4}-\d{2}-\d{2}/(mini|midi|large)(\?[A-Za-z0-9=&%._+-]*)?$' THEN
    short := substring(p_link from '^/puzzles/([a-z0-9]{8})(\?[A-Za-z0-9=&%._+-]*)?$');
    bonus_day := substring(p_link from '^/bonus/(\d{4}-\d{2}-\d{2})(\?[A-Za-z0-9=&%._+-]*)?$');
    IF short IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM published_puzzles p WHERE p.short_id = short AND p.status = 'published') THEN
        RAISE EXCEPTION 'friends:invalid';
      END IF;
    ELSIF bonus_day IS NULL OR NOT EXISTS (SELECT 1 FROM bonus_cards b WHERE b.day::text = bonus_day) THEN
      RAISE EXCEPTION 'friends:invalid';
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM friendships f WHERE f.status = 'accepted'
      AND ((f.requester_id = uid AND f.recipient_id = p_friend) OR (f.requester_id = p_friend AND f.recipient_id = uid))
  ) THEN
    RAISE EXCEPTION 'friends:not_friends';
  END IF;
  IF friends_blocked(uid, p_friend) THEN
    RETURN NULL;
  END IF;
  PERFORM friends_check_invite_limits(uid);
  INSERT INTO room_invites (kind, link, from_user_id, to_user_id)
  VALUES ('beat', p_link, uid, p_friend)
  RETURNING id INTO invite_id;
  RETURN invite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.friend_race(p_puzzle_key TEXT)
RETURNS TABLE (user_id UUID, username TEXT, seconds INT, events JSONB, with_letters BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  finished BOOLEAN;
BEGIN
  finished := EXISTS (
    SELECT 1 FROM solves s WHERE s.user_id = uid AND s.puzzle_key = p_puzzle_key AND s.mode <> 'import'
  ) AND (
    -- A Daily Plus: letters only with Plus, whatever the caller's solves say.
    NOT EXISTS (SELECT 1 FROM bonus_puzzles b WHERE b.identity = p_puzzle_key)
    OR has_entitlement(uid, 'plus')
  );
  RETURN QUERY
  SELECT t.user_id, p.username, t.seconds,
    CASE WHEN finished THEN t.events
    ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_array(e -> 0, e -> 1, CASE WHEN e ->> 2 = '' THEN 0 ELSE 1 END) ORDER BY n), '[]'::jsonb)
      FROM jsonb_array_elements(t.events) WITH ORDINALITY AS x(e, n)
    ) END,
    finished
  FROM solve_traces t
  JOIN profiles p ON p.user_id = t.user_id
  WHERE t.puzzle_key = p_puzzle_key
    AND races_are_friends(uid, t.user_id)
    AND races_visible(uid, t.user_id)
  ORDER BY t.seconds, t.user_id
  LIMIT 11;
END;
$$;

-- CREATE OR REPLACE keeps the grants; restated so this file stands alone.
REVOKE ALL ON FUNCTION public.send_beat(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_beat(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_beat(UUID, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.friend_race(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.friend_race(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.friend_race(TEXT) TO authenticated, service_role;
