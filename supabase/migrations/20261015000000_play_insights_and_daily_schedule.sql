-- Play insights + admin daily schedule.
--
-- 1. play_sessions — one row per visit to a puzzle (solo or multiplayer), sent
--    by the client as it goes (upserted by id): progress, active time, and a
--    compact per-clue record (time to solve, wrong letters, how many letters
--    came from crossings). Aggregated later into inferred difficulty, drop-off
--    points and unfair clues. Tied to the anonymous auth user; no personal data.
-- 2. daily_schedule — the constructor's queue of dailies. /daily-puzzles/<day>.json
--    is answered from here (api/daily.ts) when no static file exists for the day.

CREATE TABLE IF NOT EXISTS play_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  -- soloStats.puzzleIdentity(): title + size + solution, hashed.
  puzzle_key TEXT NOT NULL,
  puzzle_title TEXT NOT NULL DEFAULT '',
  -- 'daily' | 'nyt' | 'other'
  source TEXT NOT NULL DEFAULT 'other',
  -- 'solo' | 'versus' | 'coop' | 'async'
  mode TEXT NOT NULL DEFAULT 'solo',
  -- 'web' | 'ios' | 'android'
  client TEXT NOT NULL DEFAULT 'web',
  width SMALLINT NOT NULL,
  height SMALLINT NOT NULL,
  white_cells SMALLINT NOT NULL,
  -- Correct letters already in the grid when this visit began (a resumed solve).
  cells_at_start SMALLINT NOT NULL DEFAULT 0,
  -- Correct letters when last reported.
  cells_filled SMALLINT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  wrong_letters INTEGER NOT NULL DEFAULT 0,
  -- Time with input at most 30 s apart; idle stretches don't count.
  active_seconds INTEGER NOT NULL DEFAULT 0,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  -- [{ k: "12A", n: length, f: first focused (s), s: solved (s), w: wrong letters,
  --    x: letters that came from crossings or other players, o: solve order }]
  clues JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (width BETWEEN 1 AND 50 AND height BETWEEN 1 AND 50),
  CHECK (pg_column_size(clues) < 65536)
);

CREATE INDEX IF NOT EXISTS play_sessions_puzzle_idx ON play_sessions (puzzle_key, started_at);
CREATE INDEX IF NOT EXISTS play_sessions_user_idx ON play_sessions (user_id, started_at);

ALTER TABLE play_sessions ENABLE ROW LEVEL SECURITY;

-- Players write (and, for upserts, see) only their own sessions. Aggregates are
-- read with the service role.
CREATE POLICY "Users insert own play sessions"
  ON play_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own play sessions"
  ON play_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own play sessions"
  ON play_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS daily_schedule (
  -- Local calendar day, as in daily_results.day and the feed's file names.
  day DATE PRIMARY KEY,
  -- Same JSON as a public/daily-puzzles/<day>.json file: { theme?, puzzle }.
  entry JSONB NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  -- The studio puzzle it came from, so the studio can show what is queued.
  studio_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_schedule ENABLE ROW LEVEL SECURITY;

-- A day becomes readable once it has started somewhere on Earth (UTC+14 is at
-- most one calendar day ahead of UTC), so future dailies can't be peeked at.
-- Writes go through the studio-schedule edge function (service role) only.
CREATE POLICY "Started days are public"
  ON daily_schedule FOR SELECT
  USING (day <= (now() AT TIME ZONE 'utc')::date + 1);
