-- Push notifications, phases (c) and (d) of docs/friends-spec.md.
--
--   1. `device_tokens`: one row per device the player allowed notifications
--      on: the APNs token (iOS) or the FCM token (Android), its platform,
--      locale and time zone. Anonymous users may hold a row: the daily
--      reminder needs no identity (spec §9 Q5), and the retention sweep's
--      idle-anonymous rule retires the token with the user after 30 days
--      without opening the app, which is the right outcome.
--   2. `notification_preferences`: the per-kind switches, the reminder hour
--      and quiet hours, one row per user. Nothing is sent to a user without a
--      row, and the daily reminder is off until they turn it on.
--   3. `push_log`: one row per recipient per send with its outcome and never
--      the text, so "why didn't I get it" is answerable and the rate of
--      sends is visible. RLS on, no client policies.
--   4. `push_reminder_targets()`: the recipients whose local hour is their
--      reminder hour and who have not finished a daily today (service role).
--   5. `push_sweep()`: tokens unseen for 90 days or failed for 7, log rows
--      after 30 days, on its own pg_cron job.
--
-- The sender is the `send-push` edge function (service role). The hourly cron
-- job that calls it carries the PUSH_SENDER_SECRET header, so it is installed
-- by hand (docs/push-setup.md), like the report-alert webhook.
--
-- Deploy: `npx supabase db push` before the client with VITE_PUSH=1.

-- ---------------------------------------------------------------------------
-- 1. device_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token        TEXT NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 16 AND 4096),
  app_version  TEXT CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  locale       TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  timezone     TEXT NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) <= 64),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS device_tokens_user ON device_tokens (user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- The device writes its own row (an upsert on `token` on every registration,
-- a delete on sign-out); the sender reads with the service role.
CREATE POLICY "Users read own device tokens"
  ON device_tokens FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own device tokens"
  ON device_tokens FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users update own device tokens"
  ON device_tokens FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users delete own device tokens"
  ON device_tokens FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id             UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  daily_reminder      BOOLEAN NOT NULL DEFAULT false,
  daily_reminder_hour SMALLINT NOT NULL DEFAULT 8 CHECK (daily_reminder_hour BETWEEN 0 AND 23),
  room_invites        BOOLEAN NOT NULL DEFAULT true,
  friend_requests     BOOLEAN NOT NULL DEFAULT true,
  quiet_hours         BOOLEAN NOT NULL DEFAULT true,
  quiet_start         SMALLINT NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end           SMALLINT NOT NULL DEFAULT 8 CHECK (quiet_end BETWEEN 0 AND 23),
  -- A late race is the point of a late invite: room invites may cross quiet hours unless the player says otherwise.
  quiet_allow_invites BOOLEAN NOT NULL DEFAULT true,
  timezone            TEXT NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) <= 64),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification preferences"
  ON notification_preferences FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own notification preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users update own notification preferences"
  ON notification_preferences FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. push_log (service-internal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('daily_reminder', 'room_invite', 'beat', 'friend_request')),
  collapse_id TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome     TEXT NOT NULL CHECK (outcome IN ('sent', 'unregistered', 'failed', 'quiet', 'opted_out', 'no_token'))
);
CREATE INDEX IF NOT EXISTS push_log_sent ON push_log (sent_at);
ALTER TABLE push_log ENABLE ROW LEVEL SECURITY;
-- No policies: the sender writes it with the service role; nothing reads it from a client.

-- ---------------------------------------------------------------------------
-- 4. push_reminder_targets(): who gets the daily reminder right now
-- ---------------------------------------------------------------------------
-- The user's local hour is their reminder hour, the switch is on, and no daily
-- was finished on their local day (accounts record finishes in `solves`;
-- anonymous users' finishes are local to the device, so they are reminded
-- regardless). One row per device token.
CREATE OR REPLACE FUNCTION public.push_reminder_targets()
RETURNS TABLE (user_id UUID, token TEXT, platform TEXT, locale TEXT, timezone TEXT, local_day DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT dt.user_id, dt.token, dt.platform, dt.locale, np.timezone,
         (now() AT TIME ZONE np.timezone)::date AS local_day
  FROM notification_preferences np
  JOIN device_tokens dt ON dt.user_id = np.user_id AND dt.failed_at IS NULL
  WHERE np.daily_reminder
    AND extract(hour FROM now() AT TIME ZONE np.timezone)::int = np.daily_reminder_hour
    AND NOT EXISTS (
      SELECT 1 FROM solves s
      WHERE s.user_id = np.user_id AND s.source = 'daily'
        AND s.completed_day = (now() AT TIME ZONE np.timezone)::date
    );
$$;
REVOKE ALL ON FUNCTION public.push_reminder_targets() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. push_sweep(): retention for what this migration adds
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_sweep()
RETURNS TABLE (step TEXT, affected BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- The app re-registers its token on every launch, so a token unseen this
  -- long is an uninstalled or dormant device.
  device_token_ttl CONSTANT INTERVAL := INTERVAL '90 days';
  -- A token the store answered "unregistered" for; kept briefly so a
  -- re-registration of the same token on the next launch simply revives it.
  failed_token_ttl CONSTANT INTERVAL := INTERVAL '7 days';
  -- The longest window any limit or question is asked over is 24 hours.
  push_log_ttl CONSTANT INTERVAL := INTERVAL '30 days';
  n BIGINT;
BEGIN
  DELETE FROM device_tokens WHERE last_seen_at < now() - device_token_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'stale_device_tokens_deleted'; affected := n; RETURN NEXT;

  DELETE FROM device_tokens WHERE failed_at IS NOT NULL AND failed_at < now() - failed_token_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'failed_device_tokens_deleted'; affected := n; RETURN NEXT;

  DELETE FROM push_log WHERE sent_at < now() - push_log_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'push_log_deleted'; affected := n; RETURN NEXT;

  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.push_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-sweep') THEN
    PERFORM cron.unschedule('push-sweep');
  END IF;
END
$$;
-- 05:07 UTC, after the other sweeps (04:17 retention, 04:27 solo progress, 04:37 community, 04:47 cron history, 04:57 friends).
SELECT cron.schedule('push-sweep', '7 5 * * *', $$SELECT public.push_sweep()$$);
