-- Synced per-puzzle solo progress for Plus (docs/monetization-spec.md §2.4).
--
-- The local store (src/lib/soloProgress.ts, localStorage) stays the source of
-- truth on every device; a Plus account mirrors each record here so another
-- device can pick the puzzle up where it was. One row per (user, puzzle),
-- written by the client under RLS that requires a real account AND an
-- in-force Plus entitlement (has_entitlement from 20261024000000), read the
-- same way; nothing but the owner ever sees a row. The client merges by
-- updated_at (newer wins) and deletes the row when the puzzle is finished or
-- reset, so a row here is always a puzzle still in progress somewhere.
--
-- Size: at most MAX_PROGRESS_RECORDS (30) rows per subscriber, ~2 KB each.
-- Rows outlive a lapsed subscription for lapsed_plus_progress_ttl (90 days),
-- then solo_progress_sweep() (its own nightly job, so retention_sweep() keeps
-- its single definition) deletes them; rows die with the user by cascade.
--
-- Deploy: `npx supabase db push`.

CREATE TABLE IF NOT EXISTS solo_progress (
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- soloStats.puzzleIdentity() of the puzzle.
  puzzle_key TEXT NOT NULL CHECK (char_length(puzzle_key) BETWEEN 1 AND 80),
  -- The player's filled cells, "row,col" → CellState (letters only, no empties).
  cells      JSONB NOT NULL,
  elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  filled     INTEGER NOT NULL DEFAULT 0 CHECK (filled >= 0),
  total      INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  -- The client's own clock for this record (ms epoch as a timestamp), the merge key.
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, puzzle_key)
);

-- A 15×15 grid is at most 225 cells of a few bytes each; refuse anything that
-- is not a grid's worth of letters.
ALTER TABLE solo_progress DROP CONSTRAINT IF EXISTS solo_progress_cells_size;
ALTER TABLE solo_progress ADD CONSTRAINT solo_progress_cells_size CHECK (pg_column_size(cells) <= 32768);

CREATE INDEX IF NOT EXISTS solo_progress_updated_idx ON solo_progress (updated_at);

ALTER TABLE solo_progress ENABLE ROW LEVEL SECURITY;

-- Owner-only, real account, Plus in force (the one gate the spec puts in RLS).
CREATE POLICY "Plus accounts read own progress"
  ON solo_progress FOR SELECT
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND has_entitlement(auth.uid(), 'plus')
  );

CREATE POLICY "Plus accounts insert own progress"
  ON solo_progress FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND has_entitlement(auth.uid(), 'plus')
  );

CREATE POLICY "Plus accounts update own progress"
  ON solo_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND has_entitlement(auth.uid(), 'plus')
  );

-- Deleting (a finished or reset puzzle) needs no entitlement: a lapsed
-- subscriber finishing a puzzle should still be able to drop its row.
CREATE POLICY "Accounts delete own progress"
  ON solo_progress FOR DELETE
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ---------------------------------------------------------------------------
-- Retention: rows of a lapsed subscription
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solo_progress_sweep()
RETURNS TABLE (step TEXT, affected BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- A row whose owner no longer holds Plus is kept this long, so a subscriber
  -- who lapses and comes back within the window finds their puzzles waiting.
  lapsed_plus_progress_ttl CONSTANT INTERVAL := INTERVAL '90 days';
  n BIGINT;
BEGIN
  DELETE FROM solo_progress sp
  WHERE sp.updated_at < now() - lapsed_plus_progress_ttl
    AND NOT has_entitlement(sp.user_id, 'plus');
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'lapsed_progress_deleted'; affected := n; RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.solo_progress_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'solo-progress-sweep') THEN
    PERFORM cron.unschedule('solo-progress-sweep');
  END IF;
END
$$;

-- Ten minutes after retention_sweep (04:17 UTC), so the two never overlap.
SELECT cron.schedule('solo-progress-sweep', '27 4 * * *', $$SELECT public.solo_progress_sweep()$$);
