-- The bonus puzzle's leaderboard (docs/plus-expansion-spec.md §1.4; Andrew,
-- 2026-11-13). It reuses daily_results under slot 'bonus': times are public
-- as the dailies' are, which is fine because the puzzle is not. Only Plus
-- gets the puzzle, so only Plus may write a bonus time.

ALTER TABLE daily_results DROP CONSTRAINT IF EXISTS daily_results_slot_check;
ALTER TABLE daily_results ADD CONSTRAINT daily_results_slot_check CHECK (slot IN ('mini', 'midi', 'large', 'bonus'));

DROP POLICY IF EXISTS "Users insert own daily results" ON daily_results;
CREATE POLICY "Users insert own daily results"
  ON daily_results FOR INSERT
  WITH CHECK (auth.uid() = user_id AND (slot <> 'bonus' OR has_entitlement(auth.uid(), 'plus')));

DROP POLICY IF EXISTS "Users update own daily results" ON daily_results;
CREATE POLICY "Users update own daily results"
  ON daily_results FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (slot <> 'bonus' OR has_entitlement(auth.uid(), 'plus')));
