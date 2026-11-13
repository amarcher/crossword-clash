-- The Plus badge (docs/plus-expansion-spec.md §5; Andrew, 2026-11-13: the gold
-- seal, on by default with "Show my Plus badge" on the account page).
--
-- profiles is publicly readable, so the badge is a column there that every
-- surface can read beside the username: plus_badge, true while the account has
-- Plus and its owner hasn't hidden it (show_plus_badge). It is derived, never
-- written by a client: a BEFORE trigger on profiles recomputes it on every
-- insert and update (whatever the client sent), a trigger on entitlements
-- recomputes it when Plus starts or ends, and an hourly sweep catches the
-- subscriptions that lapse by time without a row change.
--
-- The same migration closes the leak the badge would otherwise sharpen:
-- has_entitlement(p_user, …) answered for any user id to any session, so a
-- hidden badge could still be looked up. It now answers a signed-in caller
-- about themselves only; the service role (edge functions) and jobs without
-- a session (cron) still ask about anyone.

-- The entitlement question itself, for this file's triggers and sweep only.
CREATE OR REPLACE FUNCTION public.plus_active(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = p_user
      AND e.product = 'plus'
      AND e.status IN ('active', 'grace')
      AND (e.expires_at IS NULL OR e.expires_at > now())
  );
$$;
REVOKE ALL ON FUNCTION public.plus_active(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.plus_active(UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_entitlement(p_user UUID, p_product TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (p_user = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1 FROM entitlements e
      WHERE e.user_id = p_user
        AND e.product = p_product
        AND e.status IN ('active', 'grace')
        AND (e.expires_at IS NULL OR e.expires_at > now())
    );
$$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_plus_badge BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plus_badge BOOLEAN NOT NULL DEFAULT false;

-- Whatever a client sends, the badge is what the entitlement and the owner's switch say.
CREATE OR REPLACE FUNCTION public.profiles_plus_badge() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.plus_badge := NEW.show_plus_badge AND plus_active(NEW.user_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_plus_badge() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_plus_badge ON profiles;
CREATE TRIGGER profiles_plus_badge BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_plus_badge();

-- Plus started, changed or ended: touch the profile so its trigger recomputes the badge.
CREATE OR REPLACE FUNCTION public.entitlements_plus_badge() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := coalesce(NEW.user_id, OLD.user_id);
BEGIN
  UPDATE profiles p SET plus_badge = p.plus_badge
  WHERE p.user_id = uid AND p.plus_badge IS DISTINCT FROM (p.show_plus_badge AND plus_active(uid));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.entitlements_plus_badge() FROM PUBLIC;

DROP TRIGGER IF EXISTS entitlements_plus_badge ON entitlements;
CREATE TRIGGER entitlements_plus_badge AFTER INSERT OR UPDATE OR DELETE ON entitlements
  FOR EACH ROW EXECUTE FUNCTION public.entitlements_plus_badge();

-- Subscriptions that run out by time change no row: re-derive the stale badges.
CREATE OR REPLACE FUNCTION public.plus_badge_sweep() RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE profiles p SET plus_badge = p.plus_badge
  WHERE p.plus_badge IS DISTINCT FROM (p.show_plus_badge AND plus_active(p.user_id));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.plus_badge_sweep() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.plus_badge_sweep() FROM anon, authenticated;

-- Today's subscribers get their badge now.
SELECT public.plus_badge_sweep();

SELECT cron.unschedule('plus-badge-sweep') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'plus-badge-sweep');
SELECT cron.schedule('plus-badge-sweep', '23 * * * *', $$SELECT public.plus_badge_sweep()$$);
