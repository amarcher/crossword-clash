import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The community-puzzles migration is SQL, which vitest cannot run, but its
 * shape is a promise to the client and to the admin function: nothing but
 * the four RPCs writes the tables, reports are never readable by a client, a
 * puzzle has one live copy, everything an author owns dies with the account,
 * and the sweep touches only what this migration added. These tests read the
 * file and hold it to those promises (the entitlements test's pattern).
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261028000000_community_puzzles.sql"), "utf8");

const section = (from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from)));
const fn = (name: string) => section(`CREATE OR REPLACE FUNCTION public.${name}(`, `REVOKE ALL ON FUNCTION public.${name}(`);

describe("community migration: tables", () => {
  it("creates the three tables with RLS on", () => {
    for (const table of ["publishers", "published_puzzles", "puzzle_reports"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it("gives clients read policies only: own publisher row, published puzzles plus the author's own, and nothing on reports", () => {
    const policies = [...sql.matchAll(/CREATE POLICY "[^"]+"\s+ON (\w+) FOR (\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(policies).toEqual(["publishers:SELECT", "published_puzzles:SELECT"]);
    expect(sql).toMatch(/ON publishers FOR SELECT\s+USING \(\(select auth\.uid\(\)\) = user_id\);/);
    expect(sql).toMatch(/ON published_puzzles FOR SELECT\s+USING \(status = 'published' OR \(select auth\.uid\(\)\) = author_id\);/);
  });

  it("keys every author-owned row to the account so deleting it cascades, and keeps a report with its reporter set null", () => {
    expect(section("CREATE TABLE IF NOT EXISTS publishers", "ALTER TABLE publishers")).toContain("REFERENCES profiles (user_id) ON DELETE CASCADE");
    const puzzles = section("CREATE TABLE IF NOT EXISTS published_puzzles", "ALTER TABLE published_puzzles");
    expect(puzzles).toContain("author_id       UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE");
    const reports = section("CREATE TABLE IF NOT EXISTS puzzle_reports", "ALTER TABLE puzzle_reports");
    expect(reports).toContain("puzzle_id   UUID NOT NULL REFERENCES published_puzzles (id) ON DELETE CASCADE");
    expect(reports).toContain("reporter_id UUID REFERENCES auth.users (id) ON DELETE SET NULL");
  });

  it("constrains the vocabularies and sizes the spec names", () => {
    const puzzles = section("CREATE TABLE IF NOT EXISTS published_puzzles", "ALTER TABLE published_puzzles");
    expect(puzzles).toContain("CHECK (status IN ('published', 'held', 'unpublished', 'removed'))");
    expect(puzzles).toContain("CHECK (difficulty IN ('easy', 'medium', 'hard'))");
    expect(puzzles).toContain("CHECK (lang IN ('en', 'es'))");
    expect(puzzles).toContain("CHECK (char_length(title) BETWEEN 1 AND 80)");
    expect(puzzles).toContain("CHECK (char_length(notes) <= 280)");
    expect(puzzles).toContain("CHECK (width BETWEEN 3 AND 25)");
    expect(puzzles).toContain("UNIQUE (author_id, studio_id)");
    expect(sql).toContain("CHECK (pg_column_size(puzzle) <= 65536)");
    const reports = section("CREATE TABLE IF NOT EXISTS puzzle_reports", "ALTER TABLE puzzle_reports");
    expect(reports).toContain("CHECK (reason IN ('copied', 'offensive', 'nonsense', 'other'))");
    expect(reports).toContain("CHECK (char_length(details) <= 500)");
    expect(reports).toContain("CHECK (status IN ('open', 'dismissed', 'upheld'))");
  });

  it("allows one live copy of a puzzle and one open report per person per puzzle", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS published_puzzles_live_hash\s+ON published_puzzles \(content_hash\) WHERE status IN \('published', 'held'\);/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS puzzle_reports_one_open\s+ON puzzle_reports \(puzzle_id, reporter_id\) WHERE status = 'open';/);
  });

  it("reads through a security_invoker view that carries the live username", () => {
    const view = section("CREATE OR REPLACE VIEW community_puzzles", "GRANT SELECT ON community_puzzles");
    expect(view).toContain("WITH (security_invoker = true)");
    expect(view).toContain("pr.username AS author");
    expect(view).toContain("JOIN profiles pr ON pr.user_id = p.author_id");
    expect(sql).toContain("GRANT SELECT ON community_puzzles TO anon, authenticated, service_role;");
  });

  it("adds 'community' to the solves sources without touching the other values", () => {
    expect(sql).toContain("ALTER TABLE solves DROP CONSTRAINT IF EXISTS solves_source_check;");
    expect(sql).toContain("ADD CONSTRAINT solves_source_check CHECK (source IN ('daily', 'nyt', 'community', 'other'))");
  });

  it("counts plays and solves from play_sessions as the table owner, only for live puzzles", () => {
    const trigger = fn("published_puzzle_count_play");
    expect(trigger).toContain("SECURITY DEFINER");
    expect(trigger).toContain("SET search_path = public, pg_temp");
    expect(trigger).toMatch(/IF TG_OP = 'INSERT' THEN\s+UPDATE published_puzzles\s+SET plays = plays \+ 1/);
    expect(trigger).toMatch(/ELSIF NEW\.completed AND NOT OLD\.completed THEN\s+UPDATE published_puzzles\s+SET solves = solves \+ 1/);
    expect(trigger.match(/WHERE puzzle_key = NEW\.puzzle_key AND status IN \('published', 'held'\)/g)).toHaveLength(2);
    expect(sql).toMatch(/CREATE TRIGGER play_sessions_count_published\s+AFTER INSERT OR UPDATE OF completed ON play_sessions/);
  });
});

describe("community migration: the writes", () => {
  it("requires a real account for publishing and the terms, and any signed-in user for a report", () => {
    const account = fn("community_account_id");
    expect(account).toContain("coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)");
    expect(account).toContain("RAISE EXCEPTION 'community:not_signed_in'");
    for (const name of ["accept_publishing_terms", "publish_puzzle", "unpublish_puzzle"]) expect(fn(name)).toContain("uid UUID := community_account_id();");
    const report = fn("report_puzzle");
    expect(report).toContain("uid UUID := auth.uid();");
    expect(report).not.toContain("is_anonymous");
  });

  it("runs every write as SECURITY DEFINER with a pinned search_path, callable by authenticated only", () => {
    for (const name of ["accept_publishing_terms", "publish_puzzle", "unpublish_puzzle", "report_puzzle", "community_sweep"]) {
      const body = fn(name);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = public, pg_temp");
    }
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.accept_publishing_terms(TEXT) TO authenticated, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.publish_puzzle(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.unpublish_puzzle(UUID) TO authenticated, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.report_puzzle(UUID, TEXT, TEXT) TO authenticated, service_role;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.community_sweep() FROM PUBLIC, anon, authenticated;");
  });

  it("publishes under the spec's limits and refusals", () => {
    const publish = fn("publish_puzzle");
    expect(publish).toContain("publishes_per_day CONSTANT INTEGER := 10;");
    expect(publish).toContain("live_puzzles_per_author CONSTANT INTEGER := 100;");
    expect(publish).toContain("max_side CONSTANT INTEGER := 25;");
    expect(publish).toContain("min_side CONSTANT INTEGER := 3;");
    for (const code of ["no_username", "terms", "banned", "invalid", "rate_limited", "too_many", "already_published", "under_review", "removed"]) {
      expect(publish).toContain(`RAISE EXCEPTION 'community:${code}'`);
    }
    // The author's own row for the same studio puzzle is updated, never duplicated, and version advances.
    expect(publish).toMatch(/SELECT \* INTO existing FROM published_puzzles p WHERE p\.author_id = uid AND p\.studio_id = p_studio_id;/);
    expect(publish).toMatch(/SET version = p\.version \+ 1, status = 'published'/);
    // Another author's live copy of the same content is refused.
    expect(publish).toMatch(/p\.content_hash = p_content_hash AND p\.status IN \('published', 'held'\)\s+AND NOT \(p\.author_id = uid AND p\.studio_id = p_studio_id\)/);
  });

  it("unpublishes only the author's own published row", () => {
    expect(fn("unpublish_puzzle")).toMatch(/SET status = 'unpublished', unpublished_at = now\(\)\s+WHERE p\.id = p_id AND p\.author_id = uid AND p\.status = 'published';/);
  });

  it("reports with a daily cap, never the author's own puzzle, and holds at three distinct reporters in a week", () => {
    const report = fn("report_puzzle");
    expect(report).toContain("reports_per_day CONSTANT INTEGER := 10;");
    expect(report).toContain("hold_reporters CONSTANT INTEGER := 3;");
    expect(report).toContain("hold_window CONSTANT INTERVAL := INTERVAL '7 days';");
    expect(report).toContain("RAISE EXCEPTION 'community:own_puzzle'");
    expect(report).toContain("RAISE EXCEPTION 'community:already_reported'");
    expect(report).toMatch(/SELECT count\(DISTINCT r\.reporter_id\) INTO reporters/);
    expect(report).toMatch(/IF reporters >= hold_reporters AND target\.status = 'published' THEN\s+UPDATE published_puzzles p SET status = 'held'/);
  });
});

describe("community migration: retention", () => {
  const sweep = fn("community_sweep");

  it("names its windows as constants and uses each", () => {
    const constants = [...sweep.matchAll(/(\w+) CONSTANT INTERVAL := INTERVAL '(\d+) days'/g)].map((m) => [m[1], Number(m[2])] as const);
    expect(constants).toEqual([
      ["unpublished_puzzle_ttl", 30],
      ["removed_snapshot_ttl", 30],
      ["resolved_report_ttl", 365],
    ]);
    for (const [name] of constants) expect(sweep).toMatch(new RegExp(`now\\(\\) - ${name}\\b`));
    // A removed puzzle outlives the DMCA counter-notice window (10–14 business days).
    expect(constants.find(([n]) => n === "removed_snapshot_ttl")![1]).toBeGreaterThanOrEqual(21);
  });

  it("deletes only unpublished puzzles and resolved reports, blanks a removed snapshot, and never touches a held puzzle or an open report", () => {
    expect([...sweep.matchAll(/DELETE FROM (\w+)/g)].map((m) => m[1])).toEqual(["published_puzzles", "puzzle_reports"]);
    expect(sweep).toMatch(/DELETE FROM published_puzzles\s+WHERE status = 'unpublished'/);
    expect(sweep).toMatch(/UPDATE published_puzzles SET puzzle = '\{\}'::jsonb\s+WHERE status = 'removed'/);
    expect(sweep).toMatch(/DELETE FROM puzzle_reports\s+WHERE status <> 'open'/);
    expect([...sweep.matchAll(/step := '(\w+)'/g)].map((m) => m[1])).toEqual(["unpublished_puzzles_deleted", "removed_snapshots_blanked", "resolved_reports_deleted"]);
  });

  it("has its own nightly job and leaves retention_sweep() alone", () => {
    expect(sql).not.toContain("FUNCTION public.retention_sweep");
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'community-sweep'\) THEN\s+PERFORM cron\.unschedule\('community-sweep'\);/);
    expect(sql).toMatch(/SELECT cron\.schedule\('community-sweep', '\d+ \d+ \* \* \*', \$\$SELECT public\.community_sweep\(\)\$\$\);/);
  });
});
