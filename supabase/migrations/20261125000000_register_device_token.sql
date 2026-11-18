-- A device token follows the device, not the user who first stored it.
--
-- `device_tokens` is written by the client with an upsert on `token`, under
-- row policies that let a user touch only their own rows. So when the session
-- user on a device changes, the row stays with the old user and the new
-- user's upsert is refused:
--   - a guest allows notifications, then signs in to an account they already
--     had: the token stays with the abandoned anonymous user, and the account
--     shows up as `no_token` in push_log for every invite and friend request;
--   - an account signs out: the token stays with the account, and the device
--     keeps receiving that account's notifications.
--
-- register_device_token() moves the row to the caller. Holding the token is
-- the proof: only the device the store issued it to has it. The worst a
-- caller with someone else's token could do is point that device's
-- notifications at their own account's events.

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token       TEXT,
  p_platform    TEXT,
  p_locale      TEXT,
  p_timezone    TEXT,
  p_app_version TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'push:no_session';
  END IF;
  INSERT INTO device_tokens (user_id, platform, token, app_version, locale, timezone, last_seen_at, failed_at)
  VALUES (uid, p_platform, p_token, p_app_version, p_locale, p_timezone, now(), NULL)
  ON CONFLICT (token) DO UPDATE
    SET user_id      = EXCLUDED.user_id,
        platform     = EXCLUDED.platform,
        app_version  = EXCLUDED.app_version,
        locale       = EXCLUDED.locale,
        timezone     = EXCLUDED.timezone,
        last_seen_at = now(),
        failed_at    = NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.register_device_token(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
