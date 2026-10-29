-- Autocheck (solo setting, src/lib/soloSettings.ts).
--
-- Solo play can now be played without autocheck: letters are written as typed
-- and judged when the grid is full, instead of a wrong letter being refused on
-- the spot. A finish made that way is a different kind of time, so the two
-- rows that carry solo finishes learn which mode produced them:
--
-- 1. play_sessions.autocheck — false when autocheck was off at any point of
--    the visit (the client latches it per puzzle). insights_puzzles ignores it
--    for now; the column is there so the aggregates can split the modes later.
-- 2. daily_results.autocheck — false when the day's best time was made
--    without autocheck; the leaderboard shows those rows with a small chip.
--
-- Both are nullable with a default of true: every row written before this
-- migration, and every row from a client that predates it, was made with
-- autocheck on (the only behaviour that existed), and a race always is.
--
-- Deploy order: apply this migration (`npx supabase db push`) BEFORE the client
-- that sends the column — PostgREST refuses an insert naming an unknown column,
-- which would drop every play_sessions upsert and daily_results post.

ALTER TABLE play_sessions
  ADD COLUMN IF NOT EXISTS autocheck BOOLEAN DEFAULT true;

ALTER TABLE daily_results
  ADD COLUMN IF NOT EXISTS autocheck BOOLEAN DEFAULT true;
