-- Friends and room invites, phases (a) and (b) of docs/friends-spec.md.
--
-- Joining a race used to need a code, a QR or a link in front of the other
-- person at the right moment. This migration adds:
--
--   1. `friendships`: one row per pair (requester → recipient), pending until
--      the recipient accepts; declining deletes the row and writes a cooldown.
--   2. `blocks`: one-directional, invisible to the blocked side, outlives an
--      unfriend. Every RPC answers a blocked caller as if it had worked and
--      does nothing (spec §8).
--   3. `room_invites`: a friend's invitation into a `waiting` room (kind
--      'room') or to beat a daily time (kind 'beat'). Fixed messages only:
--      there is no text column, so there is no free-text channel.
--   4. `request_cooldowns`: a declined request cannot be repeated for 7 days;
--      three declines by the same person make further requests to them
--      silently undeliverable (RLS on, no client policies).
--
-- Every user-id column references `profiles (user_id)` (which cascades from
-- `auth.users`), so a friend needs a username and deleting the account
-- removes every row here; delete-account adds nothing to OWNED_TABLES.
--
-- Writes are SECURITY DEFINER functions with the caller read from the JWT
-- inside and refusals raised as 'friends:<code>' (the community pattern);
-- `friends_sweep()` runs nightly on its own pg_cron job so `retention_sweep()`
-- keeps one definition (the solo_progress / community precedent).
--
-- Deploy: `npx supabase db push` before the client with VITE_FRIENDS=1.

-- ---------------------------------------------------------------------------
-- 1. friendships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
  requester_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);
-- One row per pair whichever way it was asked.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair
  ON friendships (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));
CREATE INDEX IF NOT EXISTS friendships_recipient ON friendships (recipient_id, status);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Either party reads the row; either party may delete it (unfriend, cancel a
-- request, or decline without a cooldown by hand). Inserts and status changes
-- only through the functions below.
CREATE POLICY "Parties read their friendships"
  ON friendships FOR SELECT
  USING ((select auth.uid()) IN (requester_id, recipient_id));
CREATE POLICY "Parties delete their friendships"
  ON friendships FOR DELETE
  USING ((select auth.uid()) IN (requester_id, recipient_id));

-- ---------------------------------------------------------------------------
-- 2. blocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- The blocked side never reads a block; the FK to profiles already requires a
-- real account.
CREATE POLICY "Blockers read own blocks"
  ON blocks FOR SELECT
  USING ((select auth.uid()) = blocker_id);
CREATE POLICY "Blockers insert own blocks"
  ON blocks FOR INSERT
  WITH CHECK ((select auth.uid()) = blocker_id);
CREATE POLICY "Blockers delete own blocks"
  ON blocks FOR DELETE
  USING ((select auth.uid()) = blocker_id);

-- ---------------------------------------------------------------------------
-- 3. room_invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL DEFAULT 'room' CHECK (kind IN ('room', 'beat')),
  game_id      UUID REFERENCES games (id) ON DELETE CASCADE,
  link         TEXT CHECK (link IS NULL OR char_length(link) <= 200),
  from_user_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_at    TIMESTAMPTZ,
  seen_at      TIMESTAMPTZ,
  CHECK ((kind = 'room') = (game_id IS NOT NULL)),
  CHECK ((kind = 'beat') = (link IS NOT NULL)),
  CHECK (from_user_id <> to_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS room_invites_once ON room_invites (game_id, to_user_id) WHERE kind = 'room';
CREATE INDEX IF NOT EXISTS room_invites_inbox ON room_invites (to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_invites_sender ON room_invites (from_user_id, created_at DESC);

ALTER TABLE room_invites ENABLE ROW LEVEL SECURITY;

-- Both parties read; inserts only through invite_to_room() / send_beat();
-- the recipient marks an invite seen through mark_invites_seen().
CREATE POLICY "Parties read their invites"
  ON room_invites FOR SELECT
  USING ((select auth.uid()) IN (from_user_id, to_user_id));
CREATE POLICY "Recipients delete their invites"
  ON room_invites FOR DELETE
  USING ((select auth.uid()) = to_user_id);

-- ---------------------------------------------------------------------------
-- 4. request_cooldowns (service-internal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS request_cooldowns (
  requester_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  declines     INTEGER NOT NULL DEFAULT 1,
  until        TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (requester_id, recipient_id)
);
ALTER TABLE request_cooldowns ENABLE ROW LEVEL SECURITY;
-- No policies: nothing but the functions below reads or writes it.

-- ---------------------------------------------------------------------------
-- 5. The writes
-- ---------------------------------------------------------------------------
-- The caller: a real (non-anonymous) account with a username.
CREATE OR REPLACE FUNCTION public.friends_account_id() RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'friends:not_signed_in';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = uid) THEN
    RAISE EXCEPTION 'friends:no_username';
  END IF;
  RETURN uid;
END;
$$;

-- A block in either direction between two accounts.
CREATE OR REPLACE FUNCTION public.friends_blocked(a UUID, b UUID) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocks bl
    WHERE (bl.blocker_id = a AND bl.blocked_id = b) OR (bl.blocker_id = b AND bl.blocked_id = a)
  );
$$;

-- Returns 'pending' (request sent), 'accepted' (they had asked first), or
-- 'sent' (nothing was written: a block or a permanent cooldown — the caller
-- is told the request went out, spec §8).
CREATE OR REPLACE FUNCTION public.send_friend_request(p_username TEXT) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requests_per_day CONSTANT INTEGER := 20;
  max_pending CONSTANT INTEGER := 100;
  uid UUID := friends_account_id();
  target UUID;
  existing friendships%ROWTYPE;
  cooldown request_cooldowns%ROWTYPE;
BEGIN
  SELECT p.user_id INTO target FROM profiles p WHERE p.username_lower = lower(btrim(coalesce(p_username, '')));
  IF target IS NULL THEN
    RAISE EXCEPTION 'friends:not_found';
  END IF;
  IF target = uid THEN
    RAISE EXCEPTION 'friends:self';
  END IF;
  IF friends_blocked(uid, target) THEN
    RETURN 'sent';
  END IF;
  SELECT * INTO cooldown FROM request_cooldowns c WHERE c.requester_id = uid AND c.recipient_id = target;
  IF FOUND THEN
    IF cooldown.until = 'infinity'::timestamptz THEN
      RETURN 'sent';
    ELSIF cooldown.until > now() THEN
      RAISE EXCEPTION 'friends:cooldown';
    END IF;
  END IF;
  SELECT * INTO existing FROM friendships f
  WHERE (f.requester_id = uid AND f.recipient_id = target) OR (f.requester_id = target AND f.recipient_id = uid);
  IF FOUND THEN
    IF existing.status = 'accepted' THEN
      RAISE EXCEPTION 'friends:already_friends';
    ELSIF existing.requester_id = uid THEN
      RAISE EXCEPTION 'friends:already_requested';
    ELSE
      -- They asked first: this is the acceptance.
      UPDATE friendships SET status = 'accepted', responded_at = now()
      WHERE requester_id = target AND recipient_id = uid;
      RETURN 'accepted';
    END IF;
  END IF;
  IF (SELECT count(*) FROM friendships f WHERE f.requester_id = uid AND f.created_at > now() - INTERVAL '24 hours') >= requests_per_day THEN
    RAISE EXCEPTION 'friends:rate_limited';
  END IF;
  IF (SELECT count(*) FROM friendships f WHERE f.requester_id = uid AND f.status = 'pending') >= max_pending THEN
    RAISE EXCEPTION 'friends:too_many';
  END IF;
  INSERT INTO friendships (requester_id, recipient_id) VALUES (uid, target);
  RETURN 'pending';
END;
$$;

-- Accept or decline a pending request made to the caller. Declining deletes
-- the row and writes (or extends) the requester's cooldown.
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_requester UUID, p_accept BOOLEAN) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  decline_cooldown CONSTANT INTERVAL := INTERVAL '7 days';
  declines_before_silence CONSTANT INTEGER := 3;
  uid UUID := friends_account_id();
  n INTEGER;
BEGIN
  IF p_accept THEN
    UPDATE friendships SET status = 'accepted', responded_at = now()
    WHERE requester_id = p_requester AND recipient_id = uid AND status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
      RAISE EXCEPTION 'friends:not_found';
    END IF;
    RETURN;
  END IF;
  DELETE FROM friendships WHERE requester_id = p_requester AND recipient_id = uid AND status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'friends:not_found';
  END IF;
  INSERT INTO request_cooldowns (requester_id, recipient_id, declines, until)
  VALUES (p_requester, uid, 1, now() + decline_cooldown)
  ON CONFLICT (requester_id, recipient_id) DO UPDATE
    SET declines = request_cooldowns.declines + 1,
        until = CASE WHEN request_cooldowns.declines + 1 >= declines_before_silence
                     THEN 'infinity'::timestamptz
                     ELSE now() + decline_cooldown END;
END;
$$;

-- Accounts the caller shared a room with, from the game rows the retention
-- sweep still keeps (90 days): the other players of every game the caller
-- played or hosted, newest first. Anonymous co-players have no profile and
-- are not listed; a block in either direction hides the person.
CREATE OR REPLACE FUNCTION public.recent_opponents()
RETURNS TABLE (user_id UUID, username TEXT, games INTEGER, last_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
BEGIN
  RETURN QUERY
  WITH mine AS (
    SELECT pl.game_id FROM players pl WHERE pl.user_id = uid
    UNION
    SELECT g.id FROM games g WHERE g.host_user_id = uid
  )
  SELECT other.user_id, pr.username, count(*)::integer AS games, max(other.created_at) AS last_at
  FROM mine
  JOIN players other ON other.game_id = mine.game_id AND other.user_id <> uid
  JOIN profiles pr ON pr.user_id = other.user_id
  WHERE NOT friends_blocked(uid, other.user_id)
  GROUP BY other.user_id, pr.username
  ORDER BY max(other.created_at) DESC
  LIMIT 50;
END;
$$;

-- The shared limits for invites and beat challenges.
CREATE OR REPLACE FUNCTION public.friends_check_invite_limits(uid UUID) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  invites_per_hour CONSTANT INTEGER := 20;
  invites_per_day CONSTANT INTEGER := 50;
BEGIN
  IF (SELECT count(*) FROM room_invites i WHERE i.from_user_id = uid AND i.created_at > now() - INTERVAL '1 hour') >= invites_per_hour
     OR (SELECT count(*) FROM room_invites i WHERE i.from_user_id = uid AND i.created_at > now() - INTERVAL '24 hours') >= invites_per_day THEN
    RAISE EXCEPTION 'friends:rate_limited';
  END IF;
END;
$$;

-- Invite an accepted friend into a `waiting` room the caller hosts or plays
-- in. Returns the invite id, or NULL when nothing was written (a block).
CREATE OR REPLACE FUNCTION public.invite_to_room(p_game_id UUID, p_friend UUID) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  room games%ROWTYPE;
  invite_id UUID;
BEGIN
  SELECT * INTO room FROM games g WHERE g.id = p_game_id;
  IF NOT FOUND OR room.status <> 'waiting' THEN
    RAISE EXCEPTION 'friends:room_not_open';
  END IF;
  IF room.host_user_id IS DISTINCT FROM uid
     AND NOT EXISTS (SELECT 1 FROM players pl WHERE pl.game_id = p_game_id AND pl.user_id = uid) THEN
    RAISE EXCEPTION 'friends:not_in_room';
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
  BEGIN
    INSERT INTO room_invites (kind, game_id, from_user_id, to_user_id)
    VALUES ('room', p_game_id, uid, p_friend)
    RETURNING id INTO invite_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'friends:already_invited';
  END;
  RETURN invite_id;
END;
$$;

-- "Beat my time": a daily challenge link to an accepted friend.
CREATE OR REPLACE FUNCTION public.send_beat(p_friend UUID, p_link TEXT) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := friends_account_id();
  invite_id UUID;
BEGIN
  -- Only the site's own daily challenge path, so an invite can never carry an arbitrary link.
  IF p_link IS NULL OR p_link !~ '^/daily/\d{4}-\d{2}-\d{2}/(mini|midi|large)(\?[A-Za-z0-9=&%._+-]*)?$' THEN
    RAISE EXCEPTION 'friends:invalid';
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

-- The recipient marks invites seen (the banner was dismissed or acted on).
CREATE OR REPLACE FUNCTION public.mark_invites_seen(p_ids UUID[]) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'friends:not_signed_in';
  END IF;
  UPDATE room_invites SET seen_at = coalesce(seen_at, now())
  WHERE id = ANY (p_ids) AND to_user_id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.friends_account_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friends_blocked(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friends_check_invite_limits(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_friend_request(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recent_opponents() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_to_room(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_beat(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_invites_seen(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_friend_request(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recent_opponents() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invite_to_room(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_beat(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_invites_seen(UUID[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. friends_sweep(): retention for what this migration adds
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.friends_sweep()
RETURNS TABLE (step TEXT, affected BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- An unanswered request.
  friend_request_ttl CONSTANT INTERVAL := INTERVAL '30 days';
  -- An invite: a room is dead after 12 h anyway (waiting_room_ttl); a week
  -- keeps the inbox's "started without you" row for a while.
  room_invite_ttl CONSTANT INTERVAL := INTERVAL '7 days';
  n BIGINT;
BEGIN
  DELETE FROM friendships WHERE status = 'pending' AND created_at < now() - friend_request_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'friend_requests_expired'; affected := n; RETURN NEXT;

  -- Finite cooldowns that have run out; the permanent ones stay.
  DELETE FROM request_cooldowns WHERE until < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'request_cooldowns_deleted'; affected := n; RETURN NEXT;

  DELETE FROM room_invites WHERE created_at < now() - room_invite_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'room_invites_deleted'; affected := n; RETURN NEXT;

  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.friends_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'friends-sweep') THEN
    PERFORM cron.unschedule('friends-sweep');
  END IF;
END
$$;
-- 04:57 UTC, after the other sweeps (04:17 retention, 04:27 solo progress, 04:37 community, 04:47 cron history).
SELECT cron.schedule('friends-sweep', '57 4 * * *', $$SELECT public.friends_sweep()$$);
