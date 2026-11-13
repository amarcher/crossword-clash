-- Streak repair (docs/plus-expansion-spec.md §4; Andrew, 2026-11-12: Plus
-- only, offered for 24 hours, no freeze).
--
-- An account's daily streak is derived from its `solves` rows (any solo
-- finish or a daily finish on a local day), so a repair is one more row: a
-- marker for the missed day, keyed 'repair:<the daily solved to repair it>',
-- mode 'import' and no time, the shape the pre-account import already uses.
-- It counts toward the streak and toward nothing else (no best time, no solve
-- count). Only this function writes one, and only:
--   * for a signed-in account (anonymous history never leaves the device) with Plus;
--   * on the caller's local "today" (the client sends it, as `solves` already
--     trusts; it must be within a day of the UTC date), for yesterday;
--   * when yesterday has no counting finish and the day before it has one,
--     i.e. a single missed day right after a streak.
-- Returns true when the day now counts (also when it already did).

CREATE OR REPLACE FUNCTION public.repair_streak(p_day DATE, p_puzzle_key TEXT, p_today DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  utc_today DATE := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'repair:no_account';
  END IF;
  IF NOT has_entitlement(uid, 'plus') THEN
    RAISE EXCEPTION 'repair:plus';
  END IF;
  IF p_today IS NULL OR p_day IS NULL OR p_today NOT BETWEEN utc_today - 1 AND utc_today + 1 OR p_day <> p_today - 1 THEN
    RAISE EXCEPTION 'repair:nothing';
  END IF;
  IF p_puzzle_key IS NULL OR char_length(p_puzzle_key) NOT BETWEEN 1 AND 72 THEN
    RAISE EXCEPTION 'repair:nothing';
  END IF;
  IF EXISTS (SELECT 1 FROM solves s WHERE s.user_id = uid AND s.completed_day = p_day AND (s.mode = 'solo' OR s.source = 'daily')) THEN
    RETURN true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM solves s WHERE s.user_id = uid AND s.completed_day = p_day - 1 AND (s.mode = 'solo' OR s.source = 'daily')) THEN
    RAISE EXCEPTION 'repair:nothing';
  END IF;
  INSERT INTO solves (user_id, puzzle_key, title, source, mode, seconds, completed_day, completed_at)
  VALUES (uid, 'repair:' || p_puzzle_key, '', 'daily', 'import', NULL, p_day, now())
  ON CONFLICT (user_id, puzzle_key, completed_day) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_streak(DATE, TEXT, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.repair_streak(DATE, TEXT, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.repair_streak(DATE, TEXT, DATE) TO authenticated, service_role;
