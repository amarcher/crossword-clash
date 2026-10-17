-- Solve history for signed-in solvers (solver accounts, phase 2).
--
-- One row per (account, puzzle, local calendar day). The app derives
-- everything it shows from these rows (src/lib/solveHistory.ts): the best time
-- per puzzle is the smallest `seconds` across days, the daily streak is the run
-- of consecutive days with a solo solve or a daily finish, and the NYT streak
-- the run of days with an NYT-bookmarklet finish. Storing facts rather than
-- counters is what makes two devices agree.
--
-- `seconds` is null for a finish with no personal time (a shared-grid versus or
-- co-op race): the day still counts toward streaks. `completed_day` is the
-- player's local day, because streaks have always been local-day streaks.
-- Anonymous players have no rows: their history stays in localStorage.
CREATE TABLE IF NOT EXISTS solves (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  puzzle_key TEXT NOT NULL CHECK (char_length(puzzle_key) BETWEEN 1 AND 80),
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  source TEXT NOT NULL CHECK (source IN ('daily', 'nyt', 'other')),
  -- 'solo', a race mode ('versus' | 'coop' | 'async'), or 'import' for rows
  -- uploaded from a device's pre-account localStorage history.
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'versus', 'coop', 'async', 'import')),
  seconds INTEGER CHECK (seconds IS NULL OR seconds >= 0),
  completed_day DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_key, completed_day)
);

CREATE INDEX IF NOT EXISTS solves_user_day_idx ON solves (user_id, completed_day);

ALTER TABLE solves ENABLE ROW LEVEL SECURITY;

-- Owner-only, and only for real accounts: the anonymous JWT carries
-- is_anonymous = true, and anonymous history never leaves the device.
CREATE POLICY "Accounts read own solves"
  ON solves FOR SELECT
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts insert own solves"
  ON solves FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts update own solves"
  ON solves FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts delete own solves"
  ON solves FOR DELETE
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- Records one or more finishes for the calling account in one round trip.
-- Upsert on (user, puzzle, day): a repeat keeps the best time, fills in a
-- title the first write lacked, and lets a real finish replace an imported
-- row's 'other' source. Runs as the caller (RLS applies) and always writes
-- auth.uid(), so a client cannot file solves under another account.
--
-- p_solves: a JSON array of {puzzle_key, title?, source, mode, seconds?,
-- completed_day, completed_at?}. Keys must be unique within one call.
CREATE OR REPLACE FUNCTION record_solves(p_solves JSONB)
RETURNS SETOF solves
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_solves requires a signed-in user';
  END IF;
  RETURN QUERY
  INSERT INTO solves (user_id, puzzle_key, title, source, mode, seconds, completed_day, completed_at)
  SELECT
    auth.uid(),
    s.puzzle_key,
    coalesce(s.title, ''),
    s.source,
    s.mode,
    s.seconds,
    s.completed_day,
    coalesce(s.completed_at, now())
  FROM jsonb_to_recordset(p_solves) AS s(
    puzzle_key TEXT,
    title TEXT,
    source TEXT,
    mode TEXT,
    seconds INTEGER,
    completed_day DATE,
    completed_at TIMESTAMPTZ
  )
  ON CONFLICT (user_id, puzzle_key, completed_day) DO UPDATE SET
    -- LEAST skips nulls, so a timed finish always beats an untimed one.
    seconds = LEAST(solves.seconds, EXCLUDED.seconds),
    title = CASE WHEN solves.title = '' THEN EXCLUDED.title ELSE solves.title END,
    source = CASE WHEN solves.source = 'other' THEN EXCLUDED.source ELSE solves.source END,
    mode = CASE
      WHEN solves.mode = 'import' THEN EXCLUDED.mode
      WHEN EXCLUDED.seconds IS NOT NULL AND (solves.seconds IS NULL OR EXCLUDED.seconds < solves.seconds) THEN EXCLUDED.mode
      ELSE solves.mode
    END,
    completed_at = GREATEST(solves.completed_at, EXCLUDED.completed_at)
  RETURNING solves.*;
END;
$$;

REVOKE ALL ON FUNCTION record_solves(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_solves(JSONB) TO authenticated;
