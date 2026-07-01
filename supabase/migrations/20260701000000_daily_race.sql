-- Daily race + cross-day leaderboard (Workstream 2).
--
-- 1. games.started_at — when the host actually released players into the grid
--    (status → 'active'). Lets every client derive the shared race time
--    (completed_at - started_at) even after a refresh/rejoin.
-- 2. daily_results — one row per (day, user): the player's best result on that
--    calendar day's daily mini, from either a solo solve or a live race.
--    Powers the cross-day leaderboard.

ALTER TABLE games ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS daily_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Local calendar day of the daily mini, "YYYY-MM-DD" (matches the client's
  -- rotation key in dailyMinis.ts / soloStats.dayKey).
  day DATE NOT NULL,
  user_id UUID NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Player',
  -- 'solo' = solved the daily alone; 'race' = live multiplayer race.
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'race')),
  -- Finish time in whole seconds. The client only replaces a row with a
  -- strictly better (lower) time.
  seconds INTEGER NOT NULL CHECK (seconds >= 0),
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day, user_id)
);

CREATE INDEX IF NOT EXISTS daily_results_day_seconds_idx
  ON daily_results (day, seconds);

ALTER TABLE daily_results ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous-auth users) can read the leaderboard.
CREATE POLICY "Anyone can read daily results"
  ON daily_results FOR SELECT
  USING (true);

-- Players may only write their own rows.
CREATE POLICY "Users insert own daily results"
  ON daily_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own daily results"
  ON daily_results FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
