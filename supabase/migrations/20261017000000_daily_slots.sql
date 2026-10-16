-- Daily slots: a second daily ("large", original 15×15 themed puzzles) beside
-- the mini. Both tables that are keyed by day gain a `slot` column, with every
-- existing row defaulting to 'mini' so nothing about the mini changes.
--
-- 1. daily_schedule — the constructor's queue. /daily-puzzles/<day>.json keeps
--    answering from slot 'mini'; /daily-puzzles/large/<day>.json answers from
--    slot 'large' (api/daily.ts). A day may hold one puzzle per slot.
-- 2. daily_results — the cross-day leaderboard. Each slot has its own board,
--    so a player's best time is now unique per (day, slot).
--
-- Row-level security is untouched: the schedule's "started days are public"
-- policy and the results' per-user write policies apply to both slots.

ALTER TABLE daily_schedule
  ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'mini' CHECK (slot IN ('mini', 'large'));

ALTER TABLE daily_schedule DROP CONSTRAINT IF EXISTS daily_schedule_pkey;
ALTER TABLE daily_schedule ADD PRIMARY KEY (day, slot);

ALTER TABLE daily_results
  ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'mini' CHECK (slot IN ('mini', 'large'));

ALTER TABLE daily_results DROP CONSTRAINT IF EXISTS daily_results_day_user_id_key;
ALTER TABLE daily_results ADD CONSTRAINT daily_results_day_slot_user_id_key UNIQUE (day, slot, user_id);

DROP INDEX IF EXISTS daily_results_day_seconds_idx;
CREATE INDEX IF NOT EXISTS daily_results_day_slot_seconds_idx
  ON daily_results (day, slot, seconds);
