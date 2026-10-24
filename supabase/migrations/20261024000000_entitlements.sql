-- Entitlements: Crossword Clash Plus (docs/monetization-spec.md §3.1).
--
-- Three tables and two functions, written by the service role only:
--
--   entitlements    one row per (user, product): what a user is entitled to,
--                   from any billing source. Every gate asks has_entitlement().
--   purchase_events every store or Stripe webhook event acted on, keyed by
--                   (source, event id), so a retried delivery is a no-op.
--   feature_usage   the metered Plus features (narrator minutes, studio Claude
--                   calls), one row per user × feature × UTC month, consumed
--                   atomically by consume_allowance().
--
-- Clients read their own rows (RLS SELECT); nothing but the verify-purchase
-- edge function (service role) ever writes them, so a client cannot grant
-- itself Plus. The retention sweep is redefined below so that a paying
-- anonymous user (an app purchase attaches to the device's anonymous id) is
-- never deleted as idle.
--
-- Deploy: `npx supabase db push`.

-- ---------------------------------------------------------------------------
-- 1. entitlements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entitlements (
  user_id           UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- 'plus' is the subscription; 'supporter' is reserved for a one-time unlock
  -- (decision 1 in the spec, not sold at launch).
  product           TEXT NOT NULL CHECK (product IN ('plus', 'supporter')),
  -- 'apple' and 'google' are reserved for direct store verification should
  -- RevenueCat ever be left; 'grant' is a row inserted by hand (press, the
  -- constructor's own accounts).
  source            TEXT NOT NULL CHECK (source IN ('revenuecat', 'stripe', 'apple', 'google', 'grant')),
  -- active: paid up or renewing. grace: the store's billing-retry window,
  -- still entitled. expired: lapsed. revoked: refunded or charged back.
  status            TEXT NOT NULL CHECK (status IN ('active', 'grace', 'expired', 'revoked')),
  -- NULL = never expires (a supporter unlock or a grant).
  expires_at        TIMESTAMPTZ,
  will_renew        BOOLEAN NOT NULL DEFAULT false,
  -- The key a restore on another device presents: RevenueCat's
  -- original_app_user_id, a Stripe subscription id, an Apple
  -- originalTransactionId or a Google purchase token.
  external_id       TEXT,
  -- Stripe customer id / RevenueCat app_user_id, for the billing portal and
  -- for cancelling billing when the account is deleted.
  external_customer TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product)
);

-- One store purchase belongs to one user at a time (a restore moves it).
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_external_key
  ON entitlements (source, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

-- Users read their own rows (anonymous users included: an app purchase can
-- attach to the anonymous id). No INSERT / UPDATE / DELETE policies: only the
-- service role (verify-purchase) writes.
CREATE POLICY "Users read own entitlements"
  ON entitlements FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. purchase_events (idempotency + audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_events (
  source      TEXT NOT NULL CHECK (source IN ('revenuecat', 'stripe', 'apple', 'google', 'admob')),
  -- RevenueCat event.id, Stripe event.id, AdMob transaction_id.
  event_id    TEXT NOT NULL,
  -- Kept for support ("what happened to this account?"); set null, not
  -- cascaded, when the user is deleted so the billing record survives.
  user_id     UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, event_id)
);

CREATE INDEX IF NOT EXISTS purchase_events_user_idx ON purchase_events (user_id, received_at);

-- Service role only: RLS on, no policies.
ALTER TABLE purchase_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. feature_usage (metered Plus features)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_usage (
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- narrator_claude_calls counts the Claude narrator's calls so that every
  -- CLAUDE_CALLS_PER_MINUTE-th one can take a narrator minute (plusAccess.ts).
  feature    TEXT NOT NULL CHECK (feature IN ('narrator_minutes', 'studio_claude', 'narrator_claude_calls')),
  -- The first day of the UTC month the row counts.
  month      DATE NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  -- Credits beyond the plan's allowance (rewarded video, goodwill).
  bonus      INTEGER NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, month)
);

ALTER TABLE feature_usage ENABLE ROW LEVEL SECURITY;

-- The studio shows "31 of 40 drafts left this month" from this. No writes.
CREATE POLICY "Users read own usage"
  ON feature_usage FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. has_entitlement(): the one question every gate asks
-- ---------------------------------------------------------------------------
-- STABLE + SECURITY DEFINER so RLS policies on other tables (a future
-- solo_progress, create_room) can call it without exposing the table itself.
CREATE OR REPLACE FUNCTION public.has_entitlement(p_user UUID, p_product TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = p_user
      AND e.product = p_product
      AND e.status IN ('active', 'grace')
      AND (e.expires_at IS NULL OR e.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.has_entitlement(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_entitlement(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. consume_allowance(): atomic metering for the edge functions
-- ---------------------------------------------------------------------------
-- Adds p_amount to this month's `used` for (user, feature) only if the result
-- stays within p_limit + bonus, in one UPDATE whose WHERE is re-evaluated
-- under the row lock, so two concurrent calls cannot both pass at the limit.
-- Returns one row either way: allowed says whether the amount was taken, and
-- used / bonus / month report the row after the call so the caller can tell
-- the client how much is left and when it resets (the 1st of next month).
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
  INSERT INTO feature_usage (user_id, feature, month)
  VALUES (p_user, p_feature, this_month)
  ON CONFLICT (user_id, feature, month) DO NOTHING;

  UPDATE feature_usage fu
  SET used = fu.used + p_amount, updated_at = now()
  WHERE fu.user_id = p_user AND fu.feature = p_feature AND fu.month = this_month
    AND fu.used + p_amount <= p_limit + fu.bonus
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

-- Only the edge functions (service role) meter; a client could otherwise
-- spend its own allowance to nothing, or probe another user's.
REVOKE ALL ON FUNCTION public.consume_allowance(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_allowance(UUID, TEXT, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. retention_sweep(): a paying anonymous user is not idle
-- ---------------------------------------------------------------------------
-- Same function as 20261023000000_retention.sql (every window unchanged; see
-- that file for the reasoning behind each), with one more owned-rows check on
-- the anonymous-user delete: a user with an entitlements row is kept. Without
-- it, an app purchase made without signing in (allowed, spec §3.5) could be
-- deleted 30 days later together with what it paid for.
-- src/lib/retentionMigration.test.ts reads the newest definition of this
-- function, so the constants here are the ones it holds to the client limits.
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
  -- never touched here, and neither is an anonymous user that holds an
  -- entitlement (an app purchase made without signing in).
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
    AND NOT EXISTS (SELECT 1 FROM games g WHERE g.host_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = u.id);
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

-- CREATE OR REPLACE keeps the function's grants, but say it again so this
-- file stands on its own.
REVOKE ALL ON FUNCTION public.retention_sweep() FROM PUBLIC, anon, authenticated;
