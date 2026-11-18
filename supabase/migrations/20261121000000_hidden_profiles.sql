-- Hidden profiles (Andrew, 2026-11-13): the screenshot accounts (`shots_free`,
-- `shots_plus`, scripts/shots.mjs) are real accounts in this project, and nobody
-- should find them by username. A hidden profile is readable only by its owner,
-- so search, the add-me link and every public join by user id come back empty.
-- Only the SQL console or the service role sets the flag: a request made with a
-- user's JWT keeps whatever the row had.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Profiles are public" ON profiles;
CREATE POLICY "Profiles are public"
  ON profiles FOR SELECT
  USING (NOT hidden OR auth.uid() = user_id);

CREATE OR REPLACE FUNCTION profiles_keep_hidden() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.hidden := CASE WHEN TG_OP = 'UPDATE' THEN OLD.hidden ELSE false END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_keep_hidden ON profiles;
CREATE TRIGGER profiles_keep_hidden
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_keep_hidden();
