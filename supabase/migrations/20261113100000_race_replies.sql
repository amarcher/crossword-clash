-- Race replies: the sender of a shared daily sees how each recipient did
-- (Andrew, 2026-11-12: "close the loop").
--
-- A recipient who races a shared link's sender (ChallengeScreen, free) files
-- their own replay at the finish (replay_shares) and then this reply, which
-- names the link's share. The sender is whoever filed that share, so both
-- sides may be anonymous sessions: the reply reaches the sender on the device
-- they shared from (an inbox on the menu, and a push where they allow them;
-- docs/push-setup-race-replies.sql installs the trigger). The recipient was
-- told on the challenge screen that the sender sees their time and solve.

CREATE TABLE IF NOT EXISTS race_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The link that was raced, and its sender (replay_shares.user_id at the time).
  share_id TEXT NOT NULL REFERENCES replay_shares (id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- The recipient who raced it, their replay, and the name they finished under.
  from_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reply_share_id TEXT REFERENCES replay_shares (id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  day DATE NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('mini', 'midi', 'large')),
  -- The recipient's time and the sender's, whole seconds.
  seconds INT NOT NULL CHECK (seconds >= 0),
  to_seconds INT NOT NULL CHECK (to_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ,
  UNIQUE (share_id, from_user_id)
);

CREATE INDEX IF NOT EXISTS race_replies_to_recent ON race_replies (to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS race_replies_from_recent ON race_replies (from_user_id, created_at);

ALTER TABLE race_replies ENABLE ROW LEVEL SECURITY;

-- The sender reads replies to their links; the recipient reads their own.
CREATE POLICY "Race replies: sender and recipient read" ON race_replies FOR SELECT
  USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

-- File a reply to a raced link. Any session; one reply per link and racer
-- (a second finish is not news); nothing when the link's sender is unknown or
-- is the caller; up to 50 replies a day each. Returns the reply's id, or null.
CREATE OR REPLACE FUNCTION public.reply_to_race(
  p_share_id TEXT, p_reply_share_id TEXT, p_name TEXT, p_day DATE, p_slot TEXT, p_seconds INT, p_to_seconds INT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  sender UUID;
  reply_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'replies:no_session';
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
  INSERT INTO race_replies (share_id, to_user_id, from_user_id, reply_share_id, name, day, slot, seconds, to_seconds)
  VALUES (p_share_id, sender, uid, p_reply_share_id, left(btrim(coalesce(nullif(btrim(p_name), ''), 'A friend')), 40), p_day, p_slot, p_seconds, p_to_seconds)
  ON CONFLICT (share_id, from_user_id) DO NOTHING
  RETURNING id INTO reply_id;
  RETURN reply_id;
END;
$$;

-- The sender marks replies seen (the menu's inbox shows unseen ones).
CREATE OR REPLACE FUNCTION public.mark_race_replies_seen(p_ids UUID[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE race_replies SET seen_at = now()
  WHERE id = ANY (p_ids) AND to_user_id = auth.uid() AND seen_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.reply_to_race(TEXT, TEXT, TEXT, DATE, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reply_to_race(TEXT, TEXT, TEXT, DATE, TEXT, INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reply_to_race(TEXT, TEXT, TEXT, DATE, TEXT, INT, INT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_race_replies_seen(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_race_replies_seen(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_race_replies_seen(UUID[]) TO authenticated, service_role;

-- The push log learns the new kind.
ALTER TABLE push_log DROP CONSTRAINT IF EXISTS push_log_kind_check;
ALTER TABLE push_log ADD CONSTRAINT push_log_kind_check
  CHECK (kind IN ('daily_reminder', 'room_invite', 'beat', 'friend_request', 'room_joined', 'room_nudge', 'race_reply'));
