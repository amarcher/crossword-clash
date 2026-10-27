-- Community puzzles (docs/community-puzzles-spec.md): a studio author
-- publishes a crossword under their username, other players find and play it,
-- anyone can report it, and the admin reviews reports from the studio.
--
-- Four pieces:
--   1. publishers         one row per author: when they accepted the publishing
--                         terms, their strikes, and whether they are stopped.
--   2. published_puzzles  one row per (author, studio puzzle): the snapshot in
--                         the transfer format (as daily_schedule.entry.puzzle),
--                         keyed for the rest of the app by puzzle_key
--                         (soloStats.puzzleIdentity()) and deduplicated by
--                         content_hash (puzzleHash.ts). Public while
--                         'published'; the author sees their own in every status.
--   3. puzzle_reports     reports from any signed-in user, anonymous included;
--                         no client can read them (the admin reads with the
--                         service role through studio-moderate).
--   4. The writes are SECURITY DEFINER functions that read the caller from the
--      JWT and count their own limits (record_solves' pattern), so the tables
--      have no client write policies at all. Admin actions go through the
--      studio-moderate edge function with the service role.
--
-- Counters: a trigger on play_sessions keeps plays / solves per puzzle, so the
-- browse screen's "Popular" sort needs no cron. Retention: community_sweep()
-- (its own nightly job, like solo_progress_sweep, so retention_sweep() keeps
-- one definition) deletes unpublished rows after 30 days, blanks a removed
-- puzzle's snapshot after 30 days (past the counter-notice window) and deletes
-- resolved reports after a year. Everything an author owns cascades with the
-- account (publishers and published_puzzles through profiles, which cascades
-- from auth.users); a report keeps its row with reporter_id set null.
--
-- Deploy: `npx supabase db push`.

-- ---------------------------------------------------------------------------
-- 1. publishers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publishers (
  user_id           UUID PRIMARY KEY REFERENCES profiles (user_id) ON DELETE CASCADE,
  terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- PUBLISHING_TERMS_VERSION (legalContent.ts) at acceptance; a newer version re-asks.
  terms_version     TEXT NOT NULL CHECK (char_length(terms_version) BETWEEN 1 AND 40),
  strikes           INTEGER NOT NULL DEFAULT 0 CHECK (strikes >= 0),
  banned_at         TIMESTAMPTZ,
  ban_reason        TEXT CHECK (ban_reason IS NULL OR char_length(ban_reason) <= 500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;

-- The studio shows "you agreed on …" and "publishing is switched off" from this. No writes.
CREATE POLICY "Users read own publisher row"
  ON publishers FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. published_puzzles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS published_puzzles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 8 characters from a 31-letter alphabet: the URL (/puzzles/<short_id>).
  short_id        TEXT NOT NULL UNIQUE CHECK (short_id ~ '^[a-z0-9]{8}$'),
  -- The author's profile (a username is required to publish); cascades with the account.
  author_id       UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  -- StudioState.id, so publishing the same studio puzzle again updates its row.
  studio_id       TEXT NOT NULL CHECK (char_length(studio_id) BETWEEN 1 AND 100),
  version         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'published'
                  CHECK (status IN ('published', 'held', 'unpublished', 'removed')),
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  notes           TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 280),
  difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  lang            TEXT NOT NULL CHECK (lang IN ('en', 'es')),
  width           SMALLINT NOT NULL CHECK (width BETWEEN 3 AND 25),
  height          SMALLINT NOT NULL CHECK (height BETWEEN 3 AND 25),
  clue_count      SMALLINT NOT NULL CHECK (clue_count >= 1),
  -- TransferPuzzle (puzzleNormalizer.ts), the same JSON as a feed file's `puzzle`.
  puzzle          JSONB NOT NULL,
  -- soloStats.puzzleIdentity(): what best times, progress, solves and play_sessions are keyed by.
  puzzle_key      TEXT NOT NULL CHECK (char_length(puzzle_key) BETWEEN 1 AND 80),
  -- puzzleHash.puzzleContentHash(): "someone already published this exact puzzle".
  content_hash    TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  plays           INTEGER NOT NULL DEFAULT 0,
  solves          INTEGER NOT NULL DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  -- The latest publish (first or an update); created_at is the first.
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  unpublished_at  TIMESTAMPTZ,
  -- Shown to the author: 'copied' | 'offensive' | 'nonsense' | 'other' | 'copyright' | 'author_blocked'.
  removed_reason  TEXT CHECK (removed_reason IS NULL OR removed_reason IN ('copied', 'offensive', 'nonsense', 'other', 'copyright', 'author_blocked')),
  moderated_by    UUID,
  moderated_at    TIMESTAMPTZ,
  moderation_note TEXT CHECK (moderation_note IS NULL OR char_length(moderation_note) <= 500),
  search          TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || notes)) STORED,
  UNIQUE (author_id, studio_id)
);

-- A 25×25 transfer puzzle is well under 20 KB; refuse anything bigger than a puzzle.
ALTER TABLE published_puzzles DROP CONSTRAINT IF EXISTS published_puzzles_puzzle_size;
ALTER TABLE published_puzzles ADD CONSTRAINT published_puzzles_puzzle_size CHECK (pg_column_size(puzzle) <= 65536);

-- One live copy of any puzzle, whoever holds it.
CREATE UNIQUE INDEX IF NOT EXISTS published_puzzles_live_hash
  ON published_puzzles (content_hash) WHERE status IN ('published', 'held');
CREATE INDEX IF NOT EXISTS published_puzzles_key_idx ON published_puzzles (puzzle_key);
CREATE INDEX IF NOT EXISTS published_puzzles_browse_idx ON published_puzzles (status, lang, published_at DESC);
CREATE INDEX IF NOT EXISTS published_puzzles_popular_idx ON published_puzzles (status, plays DESC);
CREATE INDEX IF NOT EXISTS published_puzzles_search_idx ON published_puzzles USING GIN (search);

CREATE OR REPLACE FUNCTION published_puzzles_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS published_puzzles_updated_at ON published_puzzles;
CREATE TRIGGER published_puzzles_updated_at
  BEFORE UPDATE ON published_puzzles
  FOR EACH ROW EXECUTE FUNCTION published_puzzles_set_updated_at();

ALTER TABLE published_puzzles ENABLE ROW LEVEL SECURITY;

-- Published puzzles are public (that is the point); an author also sees their
-- own held, unpublished and removed rows (with the reason). No client writes:
-- publish_puzzle / unpublish_puzzle below, and studio-moderate for the admin.
CREATE POLICY "Published puzzles are public, authors see their own"
  ON published_puzzles FOR SELECT
  USING (status = 'published' OR (select auth.uid()) = author_id);

-- The read model: a row with its author's live username. RLS of the base
-- table applies (security_invoker), so the view shows exactly what the table
-- would. The list query names its columns and leaves `puzzle` out; the page
-- asks for it.
CREATE OR REPLACE VIEW community_puzzles WITH (security_invoker = true) AS
  SELECT p.id, p.short_id, p.author_id, pr.username AS author, p.studio_id, p.version, p.status,
         p.title, p.notes, p.difficulty, p.lang, p.width, p.height, p.clue_count,
         p.puzzle, p.puzzle_key, p.plays, p.solves, p.published_at, p.updated_at, p.removed_reason, p.search
  FROM published_puzzles p
  JOIN profiles pr ON pr.user_id = p.author_id;

GRANT SELECT ON community_puzzles TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. puzzle_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id   UUID NOT NULL REFERENCES published_puzzles (id) ON DELETE CASCADE,
  -- Anonymous or account; null once that user is gone (the report stays for the record).
  reporter_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('copied', 'offensive', 'nonsense', 'other')),
  details     TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 500),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'upheld')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- One open report per person per puzzle.
CREATE UNIQUE INDEX IF NOT EXISTS puzzle_reports_one_open
  ON puzzle_reports (puzzle_id, reporter_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS puzzle_reports_reporter_idx ON puzzle_reports (reporter_id, created_at);
CREATE INDEX IF NOT EXISTS puzzle_reports_open_idx ON puzzle_reports (status, created_at);

-- RLS on and no policy at all: report_puzzle() inserts, the service role reads.
ALTER TABLE puzzle_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. solves: a community puzzle is its own source
-- ---------------------------------------------------------------------------
-- The account page labels and links these; record_solves() needs no change
-- (its conflict clause only special-cases 'other').
ALTER TABLE solves DROP CONSTRAINT IF EXISTS solves_source_check;
ALTER TABLE solves ADD CONSTRAINT solves_source_check CHECK (source IN ('daily', 'nyt', 'community', 'other'));

-- ---------------------------------------------------------------------------
-- 5. plays / solves counters from play_sessions
-- ---------------------------------------------------------------------------
-- A play is a player-session (a four-player room counts four), a solve is a
-- session that reached completed. SECURITY DEFINER because the insert runs as
-- the player, who has no UPDATE policy on published_puzzles.
CREATE OR REPLACE FUNCTION public.published_puzzle_count_play() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE published_puzzles
    SET plays = plays + 1,
        solves = solves + CASE WHEN NEW.completed THEN 1 ELSE 0 END,
        last_played_at = now()
    WHERE puzzle_key = NEW.puzzle_key AND status IN ('published', 'held');
  ELSIF NEW.completed AND NOT OLD.completed THEN
    UPDATE published_puzzles
    SET solves = solves + 1, last_played_at = now()
    WHERE puzzle_key = NEW.puzzle_key AND status IN ('published', 'held');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS play_sessions_count_published ON play_sessions;
CREATE TRIGGER play_sessions_count_published
  AFTER INSERT OR UPDATE OF completed ON play_sessions
  FOR EACH ROW EXECUTE FUNCTION public.published_puzzle_count_play();

-- ---------------------------------------------------------------------------
-- 6. The writes
-- ---------------------------------------------------------------------------
-- Every refusal is RAISE EXCEPTION with a short code as the message
-- ('community:<code>'); the client maps the code to copy.

-- The caller as a real account, or the refusal.
CREATE OR REPLACE FUNCTION public.community_account_id() RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'community:not_signed_in';
  END IF;
  RETURN uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_short_id() RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  -- No 0/o, 1/l/i: a code that survives being read aloud.
  alphabet CONSTANT TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes BYTEA := gen_random_bytes(8);
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 0..7 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- accept_publishing_terms(version): the checkbox in the publish dialog, once
-- per account per version of the publishing terms.
CREATE OR REPLACE FUNCTION public.accept_publishing_terms(p_version TEXT) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := community_account_id();
BEGIN
  IF p_version IS NULL OR char_length(p_version) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'community:invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = uid) THEN
    RAISE EXCEPTION 'community:no_username';
  END IF;
  INSERT INTO publishers (user_id, terms_version)
  VALUES (uid, p_version)
  ON CONFLICT (user_id) DO UPDATE SET terms_version = EXCLUDED.terms_version, terms_accepted_at = now();
END;
$$;

-- publish_puzzle(...): insert, or update the author's row for the same studio
-- puzzle (version + 1, back to 'published' from 'unpublished'). The client has
-- already run the full checks (publishProblems); this is the structural
-- floor, the limits and the duplicate rule, which the client cannot be
-- trusted with.
CREATE OR REPLACE FUNCTION public.publish_puzzle(
  p_studio_id TEXT,
  p_title TEXT,
  p_notes TEXT,
  p_difficulty TEXT,
  p_lang TEXT,
  p_puzzle JSONB,
  p_puzzle_key TEXT,
  p_content_hash TEXT
) RETURNS TABLE (id UUID, short_id TEXT, version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Abuse limits (docs/community-puzzles-spec.md §4.5).
  publishes_per_day CONSTANT INTEGER := 10;
  live_puzzles_per_author CONSTANT INTEGER := 100;
  max_side CONSTANT INTEGER := 25;
  min_side CONSTANT INTEGER := 3;
  max_puzzle_bytes CONSTANT INTEGER := 65536;
  uid UUID := community_account_id();
  pub publishers%ROWTYPE;
  rows_n INTEGER;
  cols_n INTEGER;
  clues_n INTEGER;
  existing published_puzzles%ROWTYPE;
  new_short TEXT;
  attempt INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = uid) THEN
    RAISE EXCEPTION 'community:no_username';
  END IF;
  SELECT * INTO pub FROM publishers WHERE user_id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community:terms';
  END IF;
  IF pub.banned_at IS NOT NULL THEN
    RAISE EXCEPTION 'community:banned';
  END IF;

  -- Structural floor.
  IF p_studio_id IS NULL OR char_length(p_studio_id) NOT BETWEEN 1 AND 100
     OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 80
     OR p_notes IS NULL OR char_length(p_notes) > 280
     OR p_difficulty NOT IN ('easy', 'medium', 'hard')
     OR p_lang NOT IN ('en', 'es')
     OR p_puzzle_key IS NULL OR char_length(p_puzzle_key) NOT BETWEEN 1 AND 80
     OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
     OR p_puzzle IS NULL OR jsonb_typeof(p_puzzle) <> 'object'
     OR pg_column_size(p_puzzle) > max_puzzle_bytes THEN
    RAISE EXCEPTION 'community:invalid';
  END IF;
  BEGIN
    rows_n := (p_puzzle -> 'size' ->> 'rows')::integer;
    cols_n := (p_puzzle -> 'size' ->> 'cols')::integer;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'community:invalid';
  END;
  IF rows_n IS NULL OR cols_n IS NULL
     OR rows_n NOT BETWEEN min_side AND max_side OR cols_n NOT BETWEEN min_side AND max_side
     OR jsonb_typeof(p_puzzle -> 'grid') <> 'array' OR jsonb_array_length(p_puzzle -> 'grid') <> rows_n * cols_n
     OR jsonb_typeof(p_puzzle -> 'gridnums') <> 'array'
     OR jsonb_typeof(p_puzzle -> 'clues' -> 'across') <> 'array' OR jsonb_typeof(p_puzzle -> 'clues' -> 'down') <> 'array'
     OR jsonb_typeof(p_puzzle -> 'answers' -> 'across') <> 'array' OR jsonb_typeof(p_puzzle -> 'answers' -> 'down') <> 'array' THEN
    RAISE EXCEPTION 'community:invalid';
  END IF;
  clues_n := jsonb_array_length(p_puzzle -> 'clues' -> 'across') + jsonb_array_length(p_puzzle -> 'clues' -> 'down');
  IF clues_n < 1 THEN
    RAISE EXCEPTION 'community:invalid';
  END IF;

  -- Limits.
  IF (SELECT count(*) FROM published_puzzles p WHERE p.author_id = uid AND p.published_at > now() - INTERVAL '24 hours') >= publishes_per_day THEN
    RAISE EXCEPTION 'community:rate_limited';
  END IF;

  SELECT * INTO existing FROM published_puzzles p WHERE p.author_id = uid AND p.studio_id = p_studio_id;

  IF existing.id IS NULL AND (SELECT count(*) FROM published_puzzles p WHERE p.author_id = uid AND p.status IN ('published', 'held')) >= live_puzzles_per_author THEN
    RAISE EXCEPTION 'community:too_many';
  END IF;

  -- One live copy of a puzzle, whoever holds it (the author's own row for this studio puzzle excepted).
  IF EXISTS (
    SELECT 1 FROM published_puzzles p
    WHERE p.content_hash = p_content_hash AND p.status IN ('published', 'held')
      AND NOT (p.author_id = uid AND p.studio_id = p_studio_id)
  ) THEN
    RAISE EXCEPTION 'community:already_published';
  END IF;

  IF existing.id IS NOT NULL THEN
    IF existing.status = 'held' THEN
      RAISE EXCEPTION 'community:under_review';
    ELSIF existing.status = 'removed' THEN
      RAISE EXCEPTION 'community:removed';
    END IF;
    UPDATE published_puzzles p
    SET version = p.version + 1, status = 'published', title = btrim(p_title), notes = p_notes,
        difficulty = p_difficulty, lang = p_lang, width = cols_n, height = rows_n, clue_count = clues_n,
        puzzle = p_puzzle, puzzle_key = p_puzzle_key, content_hash = p_content_hash,
        published_at = now(), unpublished_at = NULL
    WHERE p.id = existing.id;
    id := existing.id; short_id := existing.short_id; version := existing.version + 1;
    RETURN NEXT;
    RETURN;
  END IF;

  -- A fresh row; the short id is random, so retry the rare collision.
  FOR attempt IN 1..5 LOOP
    new_short := community_short_id();
    BEGIN
      INSERT INTO published_puzzles (short_id, author_id, studio_id, title, notes, difficulty, lang, width, height, clue_count, puzzle, puzzle_key, content_hash)
      VALUES (new_short, uid, p_studio_id, btrim(p_title), p_notes, p_difficulty, p_lang, cols_n, rows_n, clues_n, p_puzzle, p_puzzle_key, p_content_hash)
      RETURNING published_puzzles.id INTO id;
      short_id := new_short; version := 1;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- The live-hash index raced, or (rarely) the short id; the hash case was checked above, so retry.
      IF EXISTS (SELECT 1 FROM published_puzzles p WHERE p.short_id = new_short) THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'community:already_published';
    END;
  END LOOP;
  RAISE EXCEPTION 'community:invalid';
END;
$$;

-- unpublish_puzzle(id): the author's own published row leaves every list.
CREATE OR REPLACE FUNCTION public.unpublish_puzzle(p_id UUID) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := community_account_id();
BEGIN
  UPDATE published_puzzles p
  SET status = 'unpublished', unpublished_at = now()
  WHERE p.id = p_id AND p.author_id = uid AND p.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community:not_found';
  END IF;
END;
$$;

-- report_puzzle(id, reason, details): from any signed-in user, anonymous
-- included. One open report per person per puzzle, ten a day per person, never
-- the author's own; the third distinct reporter in a week holds the puzzle.
-- Returns whether the puzzle is now held.
CREATE OR REPLACE FUNCTION public.report_puzzle(p_puzzle_id UUID, p_reason TEXT, p_details TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reports_per_day CONSTANT INTEGER := 10;
  hold_reporters CONSTANT INTEGER := 3;
  hold_window CONSTANT INTERVAL := INTERVAL '7 days';
  uid UUID := auth.uid();
  target published_puzzles%ROWTYPE;
  reporters INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'community:not_signed_in';
  END IF;
  IF p_reason NOT IN ('copied', 'offensive', 'nonsense', 'other') OR p_details IS NULL OR char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'community:invalid';
  END IF;
  SELECT * INTO target FROM published_puzzles p WHERE p.id = p_puzzle_id;
  IF NOT FOUND OR target.status NOT IN ('published', 'held') THEN
    RAISE EXCEPTION 'community:not_found';
  END IF;
  IF target.author_id = uid THEN
    RAISE EXCEPTION 'community:own_puzzle';
  END IF;
  IF (SELECT count(*) FROM puzzle_reports r WHERE r.reporter_id = uid AND r.created_at > now() - INTERVAL '24 hours') >= reports_per_day THEN
    RAISE EXCEPTION 'community:rate_limited';
  END IF;
  BEGIN
    INSERT INTO puzzle_reports (puzzle_id, reporter_id, reason, details)
    VALUES (p_puzzle_id, uid, p_reason, btrim(p_details));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'community:already_reported';
  END;
  SELECT count(DISTINCT r.reporter_id) INTO reporters
  FROM puzzle_reports r
  WHERE r.puzzle_id = p_puzzle_id AND r.status = 'open' AND r.created_at > now() - hold_window;
  IF reporters >= hold_reporters AND target.status = 'published' THEN
    UPDATE published_puzzles p SET status = 'held' WHERE p.id = p_puzzle_id AND p.status = 'published';
    RETURN true;
  END IF;
  RETURN target.status = 'held';
END;
$$;

REVOKE ALL ON FUNCTION public.community_account_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_short_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_publishing_terms(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_puzzle(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_puzzle(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_puzzle(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_publishing_terms(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_puzzle(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unpublish_puzzle(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_puzzle(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. community_sweep(): retention for what this migration adds
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_sweep()
RETURNS TABLE (step TEXT, affected BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- An unpublished puzzle can be published again from the studio for this long.
  unpublished_puzzle_ttl CONSTANT INTERVAL := INTERVAL '30 days';
  -- A removed puzzle's snapshot is kept for a counter-notice (10–14 business
  -- days, /copyright) and then blanked; the stub (title, reason) stays with
  -- the author's record.
  removed_snapshot_ttl CONSTANT INTERVAL := INTERVAL '30 days';
  -- Dismissed and upheld reports, for the repeat-infringer count.
  resolved_report_ttl CONSTANT INTERVAL := INTERVAL '365 days';
  n BIGINT;
BEGIN
  DELETE FROM published_puzzles
  WHERE status = 'unpublished' AND unpublished_at < now() - unpublished_puzzle_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'unpublished_puzzles_deleted'; affected := n; RETURN NEXT;

  UPDATE published_puzzles SET puzzle = '{}'::jsonb
  WHERE status = 'removed' AND moderated_at < now() - removed_snapshot_ttl AND puzzle <> '{}'::jsonb;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'removed_snapshots_blanked'; affected := n; RETURN NEXT;

  DELETE FROM puzzle_reports
  WHERE status <> 'open' AND resolved_at < now() - resolved_report_ttl;
  GET DIAGNOSTICS n = ROW_COUNT;
  step := 'resolved_reports_deleted'; affected := n; RETURN NEXT;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.community_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_sweep() TO service_role;

-- Nightly at 04:37 UTC, ten minutes after solo_progress_sweep; re-running this
-- migration re-schedules it.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'community-sweep') THEN
    PERFORM cron.unschedule('community-sweep');
  END IF;
END
$$;
SELECT cron.schedule('community-sweep', '37 4 * * *', $$SELECT public.community_sweep()$$);
