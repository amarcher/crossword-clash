-- Puzzles in progress follow every account, not only Plus (Andrew, 2026-11-16).
--
-- Signing in means the same data on every device: 20261024100000 mirrored a
-- puzzle in progress to solo_progress for Plus accounts only, so a free
-- account's half-finished puzzle stayed on the device that started it. The
-- rows, the size limit and the merge are unchanged; the policies now ask for
-- a real account and nothing more.
--
-- The sweep follows: it deleted a lapsed subscriber's rows after 90 days.
-- Now a row nobody has touched for stale_progress_ttl goes, whoever owns it
-- (the client keeps at most 30 puzzles in progress per device).
--
-- Deploy: `npx supabase db push`. Apply before the client that syncs for
-- every account; until then a free account's writes are refused and logged,
-- and nothing is lost on the device.

DROP POLICY IF EXISTS "Plus accounts read own progress" ON solo_progress;
DROP POLICY IF EXISTS "Plus accounts insert own progress" ON solo_progress;
DROP POLICY IF EXISTS "Plus accounts update own progress" ON solo_progress;
DROP POLICY IF EXISTS "Accounts read own progress" ON solo_progress;
DROP POLICY IF EXISTS "Accounts insert own progress" ON solo_progress;
DROP POLICY IF EXISTS "Accounts update own progress" ON solo_progress;

CREATE POLICY "Accounts read own progress"
  ON solo_progress FOR SELECT
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts insert own progress"
  ON solo_progress FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts update own progress"
  ON solo_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE OR REPLACE FUNCTION public.solo_progress_sweep()
RETURNS TABLE (step TEXT, affected BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- A puzzle left unfinished and untouched this long is dropped from the account.
  stale_progress_ttl CONSTANT INTERVAL := INTERVAL '180 days';
  n BIGINT;
BEGIN
  DELETE FROM solo_progress sp
  WHERE sp.updated_at < now() - stale_progress_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'stale_progress_deleted'; affected := n; RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.solo_progress_sweep() FROM PUBLIC, anon, authenticated;
