-- A puzzle in progress carries its solve recording (Andrew, 2026-11-16).
--
-- solo_progress lets an account continue a puzzle on another device, but the
-- recording of the solve so far (src/lib/race.ts, kept on the device) stayed
-- behind: the second device saw letters it had not recorded, marked the solve
-- partial and never filed it, so a solve finished across two devices could
-- not be raced or replayed. The recording now rides with the row: the events
-- so far and the replay's marks, written with the cells it describes.
--
-- Nullable: an older client writes rows without it, and a row whose
-- recording does not match its cells is treated as partial by the client.
-- Bounded like save_solve_trace's input, with room for the marks.
--
-- Deploy: `npx supabase db push`. Before the client: without the column the
-- client's reads and writes of solo_progress fail (logged, nothing lost on
-- the device) until it exists.

ALTER TABLE solo_progress ADD COLUMN IF NOT EXISTS trace JSONB;
ALTER TABLE solo_progress DROP CONSTRAINT IF EXISTS solo_progress_trace_size;
ALTER TABLE solo_progress ADD CONSTRAINT solo_progress_trace_size CHECK (trace IS NULL OR pg_column_size(trace) <= 131072);
