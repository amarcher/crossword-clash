-- Short share IDs for solve replays (Andrew, 2026-11-12).
--
-- A shared daily's link used to carry its whole replay code (src/lib/replayCode.ts),
-- about 825 characters for a 15×15: too long to go out as one message. The code
-- is now filed here once, under an 11-character ID derived from the code itself
-- (the same solve always gets the same ID, and an ID never changes meaning, so
-- /api/replay's response stays cacheable for good), and the link carries the ID.
-- A code holds the grid's shape and a timeline of right / wrong / refused
-- squares and clue changes, never a letter, so rows are public by ID.

CREATE TABLE IF NOT EXISTS replay_shares (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{11}$'),
  -- Postgres caps a regex repetition at 255, so the length is checked apart.
  code TEXT NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]+$' AND char_length(code) BETWEEN 4 AND 3000),
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS replay_shares_user_recent ON replay_shares (user_id, created_at);

ALTER TABLE replay_shares ENABLE ROW LEVEL SECURITY;

-- Read by ID (the share link and /api/replay); writes only through the function below.
CREATE POLICY "Replay shares are public" ON replay_shares FOR SELECT USING (true);

-- File a replay code and return its ID: the first 11 characters of its
-- SHA-256 in base64url. Any session may (players stay anonymous Supabase
-- users), up to 100 new codes a day each; a code already filed just returns
-- its ID.
CREATE OR REPLACE FUNCTION public.create_replay_share(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  share_id TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'replays:no_session';
  END IF;
  IF p_code IS NULL OR p_code !~ '^[A-Za-z0-9_-]+$' OR char_length(p_code) NOT BETWEEN 4 AND 3000 THEN
    RAISE EXCEPTION 'replays:bad_code';
  END IF;
  share_id := left(translate(rtrim(encode(extensions.digest(p_code, 'sha256'), 'base64'), '='), '+/', '-_'), 11);
  IF EXISTS (SELECT 1 FROM replay_shares r WHERE r.id = share_id) THEN
    RETURN share_id;
  END IF;
  IF (SELECT count(*) FROM replay_shares r WHERE r.user_id = uid AND r.created_at > now() - INTERVAL '1 day') >= 100 THEN
    RAISE EXCEPTION 'replays:rate_limited';
  END IF;
  INSERT INTO replay_shares (id, code, user_id) VALUES (share_id, p_code, uid) ON CONFLICT (id) DO NOTHING;
  RETURN share_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_replay_share(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_replay_share(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_replay_share(TEXT) TO authenticated, service_role;

-- Shares are kept a year: the link still plays the daily after that, only its preview goes.
CREATE OR REPLACE FUNCTION public.replay_shares_sweep() RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n INT;
BEGIN
  DELETE FROM replay_shares WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.replay_shares_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'replay-shares-sweep') THEN
    PERFORM cron.unschedule('replay-shares-sweep');
  END IF;
END
$$;

-- After the other nightly sweeps (the last, solve-traces-sweep, runs at 05:07 UTC).
SELECT cron.schedule('replay-shares-sweep', '17 5 * * *', $$SELECT public.replay_shares_sweep()$$);
