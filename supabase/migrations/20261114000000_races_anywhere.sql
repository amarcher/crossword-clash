-- Race invites from any finished puzzle (Andrew, 2026-11-12: "It should be
-- possible to send a notification to invite a friend to race your solve from
-- any finished puzzle", and the combined race viewable by both).
--
-- 1. send_beat takes a community puzzle's challenge link
--    (/puzzles/<short_id>?beat=…&by=…&r=…) as well as any day's daily, so a
--    finish of a past daily or a published community puzzle can be sent to a
--    friend. Imports have no such link and stay out.
-- 2. race_replies names a community puzzle by short ID (and its title, as it
--    was when raced) instead of a day and slot, so its sender hears how the
--    race went and both can watch it side by side (/reply/:id).

CREATE OR REPLACE FUNCTION public.send_beat(p_friend UUID, p_link TEXT) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  invite_id UUID;
  short TEXT;
BEGIN
  -- Only the site's own challenge paths, so an invite can never carry an arbitrary link:
  -- a day's daily, or a published community puzzle.
  IF p_link IS NULL THEN
    RAISE EXCEPTION 'friends:invalid';
  END IF;
  IF p_link !~ '^/daily/\d{4}-\d{2}-\d{2}/(mini|midi|large)(\?[A-Za-z0-9=&%._+-]*)?$' THEN
    short := substring(p_link from '^/puzzles/([a-z0-9]{8})(\?[A-Za-z0-9=&%._+-]*)?$');
    IF short IS NULL OR NOT EXISTS (SELECT 1 FROM published_puzzles p WHERE p.short_id = short AND p.status = 'published') THEN
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

-- A reply names a daily (day + slot) or a community puzzle (short ID + title).
ALTER TABLE race_replies ALTER COLUMN day DROP NOT NULL;
ALTER TABLE race_replies ALTER COLUMN slot DROP NOT NULL;
ALTER TABLE race_replies ADD COLUMN IF NOT EXISTS short_id TEXT CHECK (short_id ~ '^[a-z0-9]{8}$');
ALTER TABLE race_replies ADD COLUMN IF NOT EXISTS title TEXT CHECK (char_length(title) <= 80);
ALTER TABLE race_replies DROP CONSTRAINT IF EXISTS race_replies_puzzle_check;
ALTER TABLE race_replies ADD CONSTRAINT race_replies_puzzle_check CHECK (
  (day IS NOT NULL AND slot IS NOT NULL AND short_id IS NULL)
  OR (day IS NULL AND slot IS NULL AND short_id IS NOT NULL)
);

-- The old signature goes; p_short_id defaults to null, so a client that still
-- sends only a day and slot (an app build from before this) keeps working.
DROP FUNCTION IF EXISTS public.reply_to_race(TEXT, TEXT, TEXT, DATE, TEXT, INT, INT);

-- File a reply to a raced link. Any session; one reply per link and racer
-- (a second finish is not news); nothing when the link's sender is unknown or
-- is the caller; up to 50 replies a day each. Returns the reply's id, or null.
CREATE OR REPLACE FUNCTION public.reply_to_race(
  p_share_id TEXT, p_reply_share_id TEXT, p_name TEXT, p_day DATE, p_slot TEXT, p_seconds INT, p_to_seconds INT, p_short_id TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  sender UUID;
  puzzle_title TEXT;
  reply_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'replies:no_session';
  END IF;
  IF p_short_id IS NOT NULL THEN
    SELECT p.title INTO puzzle_title FROM published_puzzles p WHERE p.short_id = p_short_id;
    IF puzzle_title IS NULL THEN
      RAISE EXCEPTION 'replies:bad_puzzle';
    END IF;
  ELSIF p_day IS NULL OR p_slot IS NULL THEN
    RAISE EXCEPTION 'replies:bad_puzzle';
  END IF;
  SELECT r.user_id INTO sender FROM replay_shares r WHERE r.id = p_share_id;
  IF sender IS NULL OR sender = uid THEN
    RETURN NULL;
  END IF;
  IF p_reply_share_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM replay_shares r WHERE r.id = p_reply_share_id) THEN
    RAISE EXCEPTION 'replies:bad_reply';
  END IF;
  IF (SELECT count(*) FROM race_replies r WHERE r.from_user_id = uid AND r.created_at > now() - INTERVAL '1 day') >= 50 THEN
    RAISE EXCEPTION 'replies:rate_limited';
  END IF;
  INSERT INTO race_replies (share_id, to_user_id, from_user_id, reply_share_id, name, day, slot, short_id, title, seconds, to_seconds)
  VALUES (
    p_share_id, sender, uid, p_reply_share_id, left(btrim(coalesce(nullif(btrim(p_name), ''), 'A friend')), 40),
    CASE WHEN p_short_id IS NULL THEN p_day END, CASE WHEN p_short_id IS NULL THEN p_slot END, p_short_id, puzzle_title,
    p_seconds, p_to_seconds
  )
  ON CONFLICT (share_id, from_user_id) DO NOTHING
  RETURNING id INTO reply_id;
  RETURN reply_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reply_to_race(TEXT, TEXT, TEXT, DATE, TEXT, INT, INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reply_to_race(TEXT, TEXT, TEXT, DATE, TEXT, INT, INT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reply_to_race(TEXT, TEXT, TEXT, DATE, TEXT, INT, INT, TEXT) TO authenticated, service_role;
