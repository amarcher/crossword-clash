-- Room rendezvous, phase (f) of docs/friends-spec.md (§3.7).
--
-- An invite into a room is asynchronous: the host is told nothing when a
-- friend arrives, and a joiner cannot tell that a host whose phone is locked
-- is away. This migration adds the server half of the fix:
--
--   1. `room_invites.response`: the invitee's "Can't now" (`declined`, else
--      null), written only by `respond_room_invite()` and read by the sender
--      through the existing parties-read policy, so the lobby's invite list
--      can say "Can't right now".
--   2. `room_nudges`: one row per "Nudge host" from a waiting joiner, written
--      by `nudge_host()` (one per caller per room per 3 minutes, nothing for a
--      blocked pair) and turned into a push by a webhook trigger installed by
--      hand (`docs/push-setup-nudges.sql`, since the secret cannot sit here).
--      Both user columns reference auth.users: an anonymous joiner may nudge
--      (the push then says "A player"), and an anonymous host may hold a
--      device token. RLS on, no client policies; rows cascade with the game,
--      which the retention sweep deletes, so no sweep step is needed.
--   3. `push_log.kind` admits the two new kinds the sender logs
--      (`room_joined`, the first join; `room_nudge`).
--
-- Deploy: `npx supabase db push` before the client, then the two trigger
-- files in docs/ (docs/push-setup.md §5).

-- ---------------------------------------------------------------------------
-- 1. room_invites.response
-- ---------------------------------------------------------------------------
ALTER TABLE room_invites ADD COLUMN IF NOT EXISTS response TEXT CHECK (response IN ('declined'));

-- The recipient answers an open room invite; the only answer is "declined"
-- (accepting is joining). Marks it seen as well, so the banner never shows a
-- declined invite again.
CREATE OR REPLACE FUNCTION public.respond_room_invite(p_invite UUID, p_response TEXT) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  n INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'friends:not_signed_in';
  END IF;
  IF p_response IS DISTINCT FROM 'declined' THEN
    RAISE EXCEPTION 'friends:invalid';
  END IF;
  UPDATE room_invites SET response = p_response, seen_at = coalesce(seen_at, now())
  WHERE id = p_invite AND to_user_id = uid AND kind = 'room';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'friends:not_found';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. room_nudges and nudge_host()
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_nudges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      UUID NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS room_nudges_sender ON room_nudges (game_id, from_user_id, created_at DESC);

ALTER TABLE room_nudges ENABLE ROW LEVEL SECURITY;
-- No policies: nudge_host() writes, the webhook trigger reads the new row.

-- A player of a `waiting` room who is not its host asks the host to come
-- back. Returns the nudge id, or NULL when nothing was written (a block in
-- either direction, spec §8).
CREATE OR REPLACE FUNCTION public.nudge_host(p_game_id UUID) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  nudge_cooldown CONSTANT INTERVAL := INTERVAL '3 minutes';
  uid UUID := auth.uid();
  room games%ROWTYPE;
  nudge_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'friends:not_signed_in';
  END IF;
  SELECT * INTO room FROM games g WHERE g.id = p_game_id;
  IF NOT FOUND OR room.status <> 'waiting' THEN
    RAISE EXCEPTION 'friends:room_not_open';
  END IF;
  IF room.host_user_id IS NULL OR room.host_user_id = uid THEN
    RAISE EXCEPTION 'friends:not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players pl WHERE pl.game_id = p_game_id AND pl.user_id = uid) THEN
    RAISE EXCEPTION 'friends:not_in_room';
  END IF;
  IF friends_blocked(uid, room.host_user_id) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM room_nudges n
    WHERE n.game_id = p_game_id AND n.from_user_id = uid AND n.created_at > now() - nudge_cooldown
  ) THEN
    RAISE EXCEPTION 'friends:too_soon';
  END IF;
  INSERT INTO room_nudges (game_id, from_user_id, to_user_id)
  VALUES (p_game_id, uid, room.host_user_id)
  RETURNING id INTO nudge_id;
  RETURN nudge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_room_invite(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nudge_host(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_room_invite(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nudge_host(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. push_log admits the two new kinds
-- ---------------------------------------------------------------------------
ALTER TABLE push_log DROP CONSTRAINT IF EXISTS push_log_kind_check;
ALTER TABLE push_log ADD CONSTRAINT push_log_kind_check
  CHECK (kind IN ('daily_reminder', 'room_invite', 'beat', 'friend_request', 'room_joined', 'room_nudge'));
