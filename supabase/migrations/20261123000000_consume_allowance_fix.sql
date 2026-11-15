-- consume_allowance never ran (found 2026-11-14).
--
-- Its RETURNS TABLE names an output column `month`, and the function's
-- `INSERT ... ON CONFLICT (user_id, feature, month)` then failed on every
-- call with `column reference "month" is ambiguous` (a PL/pgSQL variable or
-- the table column). The edge functions fail closed on an error, so every
-- Plus subscriber was told "Your AI host minutes for this month are used up"
-- on the first event of a game, and a subscriber's studio drafts were refused
-- the same way. feature_usage had no row for anyone.
--
-- The body is unchanged except that the conflict target names the table's
-- primary key by constraint, which has no column name to confuse, and the
-- bonus-inclusive limit is compared in BIGINT so a caller's "no limit"
-- (2147483647, plusAccess.ts chargeClaudeCall) cannot overflow.
--
-- Deploy: `npx supabase db push`, then redeploy narrator-claude (the shared
-- plusAccess.ts change).

CREATE OR REPLACE FUNCTION public.consume_allowance(p_user UUID, p_feature TEXT, p_amount INTEGER, p_limit INTEGER)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, bonus INTEGER, month DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  this_month CONSTANT DATE := (date_trunc('month', now() AT TIME ZONE 'utc'))::date;
  v_used INTEGER;
  v_bonus INTEGER;
BEGIN
  IF p_amount < 0 OR p_limit < 0 THEN
    RAISE EXCEPTION 'consume_allowance: amount and limit must be non-negative';
  END IF;

  -- Make sure this month's row exists, then take the amount only if it fits.
  INSERT INTO feature_usage AS fu (user_id, feature, month)
  VALUES (p_user, p_feature, this_month)
  ON CONFLICT ON CONSTRAINT feature_usage_pkey DO NOTHING;

  UPDATE feature_usage fu
  SET used = fu.used + p_amount, updated_at = now()
  WHERE fu.user_id = p_user AND fu.feature = p_feature AND fu.month = this_month
    AND fu.used::bigint + p_amount <= p_limit::bigint + fu.bonus
  RETURNING fu.used, fu.bonus INTO v_used, v_bonus;

  IF FOUND THEN
    allowed := true;
  ELSE
    allowed := false;
    SELECT fu.used, fu.bonus INTO v_used, v_bonus
    FROM feature_usage fu
    WHERE fu.user_id = p_user AND fu.feature = p_feature AND fu.month = this_month;
  END IF;

  used := v_used;
  bonus := v_bonus;
  month := this_month;
  RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_allowance(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_allowance(UUID, TEXT, INTEGER, INTEGER) TO service_role;
