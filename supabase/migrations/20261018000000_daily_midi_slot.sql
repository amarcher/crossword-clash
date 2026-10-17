-- A third daily slot, "midi" (original 9×9s), between the mini and the large.
-- Only the slot check constraints change; the (day, slot) keys from
-- 20261017000000_daily_slots.sql already allow one puzzle per slot per day.
-- The constraint names are the ones Postgres generated for the inline CHECKs.
ALTER TABLE daily_schedule DROP CONSTRAINT IF EXISTS daily_schedule_slot_check;
ALTER TABLE daily_schedule ADD CONSTRAINT daily_schedule_slot_check CHECK (slot IN ('mini', 'midi', 'large'));

ALTER TABLE daily_results DROP CONSTRAINT IF EXISTS daily_results_slot_check;
ALTER TABLE daily_results ADD CONSTRAINT daily_results_slot_check CHECK (slot IN ('mini', 'midi', 'large'));
