-- Retention and write hygiene (docs/scalability-audit.md §1–2, recommendation 1).
--
-- Nothing in the schema ever shrank: rooms stayed `waiting`/`active` forever
-- unless the host pressed Close (51% of games), finished games and their
-- puzzles were never deleted, every device that ever loaded the page kept an
-- anonymous auth user, `narrator_usage` gained a row per narrator call, and
-- `play_sessions.clues` (the largest JSONB) was kept indefinitely. This
-- migration:
--
-- 1. adds `games.updated_at`, maintained by a trigger, so "a room nobody has
--    touched" has a meaning (claim_cell, start, complete and close all UPDATE
--    the row; a lobby join does not, so a waiting room ages from creation);
-- 2. defines `retention_sweep()`, one function with every window as a named
--    constant, which returns what it did per step so it can be run by hand
--    (`select * from retention_sweep();`) and read back;
-- 3. schedules it nightly with pg_cron;
-- 4. indexes `play_sessions (started_at)`, the filter `insights_puzzles` runs
--    over the whole table;
-- 5. takes `games` and `players` out of the `supabase_realtime` publication:
--    nothing subscribes to Postgres Changes (rooms use Broadcast), so Realtime
--    decoded every row update, including each solo keystroke, for nobody.
--
-- Client contracts the windows respect (src/lib/sessionPersistence.ts): a saved
-- room session is ignored after MP_SESSION_MAX_AGE_MS (12 h), and a still
-- `waiting` room is only auto-rejoined when the session was touched within
-- MP_SESSION_RECENT_MS (1 h). `src/lib/retentionMigration.test.ts` reads this
-- file and checks the constants against those limits.
--
-- Deploy: `npx supabase db push`. The first nightly run (or a manual
-- `select * from retention_sweep();`) closes every waiting room older than
-- 12 h and every active room untouched for 24 h, deletes closed/completed
-- games older than 90 days (players cascade; daily_results.game_id is set
-- null), orphan puzzles, anonymous users idle for 30 days with no rows of
-- their own, narrator_usage older than 31 days and play_sessions older than
-- two years, and blanks clue detail on play_sessions older than 180 days.

-- ---------------------------------------------------------------------------
-- 1. games.updated_at
-- ---------------------------------------------------------------------------
ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill from what the row already knows, so the first sweep judges existing
-- rooms by their real last activity rather than by the moment of this migration.
UPDATE games
SET updated_at = GREATEST(created_at, COALESCE(started_at, created_at), COALESCE(completed_at, created_at))
WHERE updated_at > created_at;

CREATE OR REPLACE FUNCTION games_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS games_updated_at ON games;
CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION games_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_games_status_updated_at ON games (status, updated_at);

-- ---------------------------------------------------------------------------
-- 2. retention_sweep()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retention_sweep()
RETURNS TABLE (step TEXT, affected BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- A lobby nobody has started. The client only auto-rejoins a waiting room
  -- whose session was touched within the last hour (MP_SESSION_RECENT_MS), so
  -- 12 h leaves a wide margin; a six-character code stops being joinable then.
  waiting_room_ttl CONSTANT INTERVAL := INTERVAL '12 hours';
  -- A started room with no claim, start, finish or close for a day. A saved
  -- session is ignored after 12 h (MP_SESSION_MAX_AGE_MS); a race lasts
  -- minutes, so a day of silence is a room everyone left.
  active_room_ttl CONSTANT INTERVAL := INTERVAL '24 hours';
  -- Closed and completed games (with their players, by cascade) are kept this
  -- long for the usage investigation and any "replay"; daily_results keeps its
  -- own copy of the time and only loses the game_id link.
  finished_game_ttl CONSTANT INTERVAL := INTERVAL '90 days';
  -- uploadPuzzle inserts the puzzle row moments before createGame inserts the
  -- game, so a puzzle with no game yet is only an orphan once it is older than
  -- this; daily_schedule stores its own JSON and never references puzzles.
  orphan_puzzle_grace CONSTANT INTERVAL := INTERVAL '1 day';
  -- An anonymous auth user (one per device that ever loaded the page) that has
  -- not refreshed its session in this long and owns no rows is just a device
  -- that never came back; the next visit simply signs in anonymously again.
  idle_anonymous_user_ttl CONSTANT INTERVAL := INTERVAL '30 days';
  -- Rate-limit rows. The longest window they are queried over is the 30-day
  -- demo-grant window in supabase/functions/_shared/rateLimit.ts.
  narrator_usage_ttl CONSTANT INTERVAL := INTERVAL '31 days';
  -- Per-clue detail (the big JSONB) is only read by insights_clues over the
  -- last 90 days at most; the summary columns stay for long-run comparisons.
  play_session_clues_ttl CONSTANT INTERVAL := INTERVAL '180 days';
  -- The whole play_sessions row.
  play_session_ttl CONSTANT INTERVAL := INTERVAL '2 years';
  n BIGINT;
BEGIN
  -- Stale rooms are closed first, so the deletion below never removes a room
  -- someone could still be in: a room closed here lives another
  -- finished_game_ttl from this moment (the trigger stamps updated_at).
  UPDATE games SET status = 'closed'
  WHERE status = 'waiting' AND updated_at < now() - waiting_room_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'waiting_rooms_closed'; affected := n; RETURN NEXT;

  UPDATE games SET status = 'closed'
  WHERE status = 'active' AND updated_at < now() - active_room_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'active_rooms_closed'; affected := n; RETURN NEXT;

  DELETE FROM games
  WHERE status IN ('closed', 'completed') AND updated_at < now() - finished_game_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'finished_games_deleted'; affected := n; RETURN NEXT;

  DELETE FROM puzzles p
  WHERE p.created_at < now() - orphan_puzzle_grace
    AND NOT EXISTS (SELECT 1 FROM games g WHERE g.puzzle_id = p.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'orphan_puzzles_deleted'; affected := n; RETURN NEXT;

  -- Supabase has no automatic cleanup of anonymous users. Deleting the auth
  -- row cascades through auth.identities, auth.sessions and
  -- auth.refresh_tokens. A refresh token row is written on every token
  -- refresh, so "no refresh token newer than the window" is the device being
  -- gone, not merely quiet on the menu. Accounts (is_anonymous = false) are
  -- never touched here.
  DELETE FROM auth.users u
  WHERE u.is_anonymous
    AND u.created_at < now() - idle_anonymous_user_ttl
    AND NOT EXISTS (
      SELECT 1 FROM auth.refresh_tokens rt
      WHERE rt.user_id = u.id::text AND rt.created_at > now() - idle_anonymous_user_ttl
    )
    AND NOT EXISTS (SELECT 1 FROM players pl WHERE pl.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM play_sessions ps WHERE ps.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM daily_results dr WHERE dr.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM narrator_sessions ns WHERE ns.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM games g WHERE g.host_user_id = u.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'idle_anonymous_users_deleted'; affected := n; RETURN NEXT;

  DELETE FROM narrator_usage WHERE created_at < now() - narrator_usage_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'narrator_usage_deleted'; affected := n; RETURN NEXT;

  -- `clues` is NOT NULL with an empty-array default, so "nulled" means emptied.
  UPDATE play_sessions SET clues = '[]'::jsonb
  WHERE started_at < now() - play_session_clues_ttl AND clues <> '[]'::jsonb;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'play_session_clues_blanked'; affected := n; RETURN NEXT;

  DELETE FROM play_sessions WHERE started_at < now() - play_session_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'play_sessions_deleted'; affected := n; RETURN NEXT;

  RETURN;
END;
$$;

-- Owner-only: it deletes across tables and auth, so it must never be callable
-- over PostgREST.
REVOKE ALL ON FUNCTION public.retention_sweep() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Nightly schedule
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- Re-scheduling under the same name is how the job is changed; unschedule the
-- previous definition first so a re-run of this file is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-sweep') THEN
    PERFORM cron.unschedule('retention-sweep');
  END IF;
END
$$;

-- 04:17 UTC daily: the quietest hour for a US/European audience, off the hour
-- so it never lines up with other jobs.
SELECT cron.schedule('retention-sweep', '17 4 * * *', $$SELECT public.retention_sweep()$$);

-- pg_cron keeps one row per run in cron.job_run_details and never prunes it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-history-cleanup') THEN
    PERFORM cron.unschedule('cron-history-cleanup');
  END IF;
END
$$;
SELECT cron.schedule('cron-history-cleanup', '47 4 * * *', $$DELETE FROM cron.job_run_details WHERE end_time < now() - INTERVAL '30 days'$$);

-- ---------------------------------------------------------------------------
-- 4. The index insights_puzzles was missing
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS play_sessions_started_idx ON play_sessions (started_at);

-- ---------------------------------------------------------------------------
-- 5. Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'games') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.games;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'players') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.players;
  END IF;
END
$$;
