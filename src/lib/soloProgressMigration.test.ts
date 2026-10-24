import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_PROGRESS_RECORDS } from "./soloProgress";

/**
 * The solo_progress migration is SQL, which vitest cannot run; these tests
 * read it and hold it to the sync's contract: owner-only rows, Plus required
 * to read and write (not to delete), a bounded row size, and a sweep of
 * lapsed subscribers' rows that leaves retention_sweep() alone.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261024100000_solo_progress.sql"), "utf8");

const policy = (name: string) => {
  const start = sql.indexOf(`CREATE POLICY "${name}"`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(";", start));
};

describe("solo_progress migration", () => {
  it("creates the table keyed by (user, puzzle) with RLS on and a bounded cells column", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS solo_progress (");
    expect(sql).toContain("PRIMARY KEY (user_id, puzzle_key)");
    expect(sql).toContain("REFERENCES auth.users (id) ON DELETE CASCADE");
    expect(sql).toContain("ALTER TABLE solo_progress ENABLE ROW LEVEL SECURITY;");
    expect(sql).toMatch(/CHECK \(pg_column_size\(cells\) <= \d+\)/);
    // The constraint must hold a full 15×15 of cells with room to spare but no more than the bounded store would ever send.
    expect(MAX_PROGRESS_RECORDS).toBe(30);
  });

  it("requires a real account with Plus to read, insert and update, and only a real account to delete", () => {
    for (const name of ["Plus accounts read own progress", "Plus accounts insert own progress", "Plus accounts update own progress"]) {
      const p = policy(name);
      expect(p).toContain("auth.uid() = user_id");
      expect(p).toContain("coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false");
      expect(p).toContain("has_entitlement(auth.uid(), 'plus')");
    }
    const del = policy("Accounts delete own progress");
    expect(del).toContain("FOR DELETE");
    expect(del).toContain("auth.uid() = user_id");
    expect(del).not.toContain("has_entitlement");
    const kinds = [...sql.matchAll(/ON solo_progress FOR (\w+)/g)].map((m) => m[1]);
    expect(kinds).toEqual(["SELECT", "INSERT", "UPDATE", "DELETE"]);
  });

  it("sweeps lapsed subscribers' rows after 90 days in its own scheduled function, without touching retention_sweep", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.solo_progress_sweep()");
    expect(sql).toMatch(/lapsed_plus_progress_ttl CONSTANT INTERVAL := INTERVAL '90 days'/);
    expect(sql).toMatch(/DELETE FROM solo_progress sp\s+WHERE sp\.updated_at < now\(\) - lapsed_plus_progress_ttl\s+AND NOT has_entitlement\(sp\.user_id, 'plus'\)/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.solo_progress_sweep() FROM PUBLIC, anon, authenticated;");
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'solo-progress-sweep'\) THEN\s+PERFORM cron\.unschedule\('solo-progress-sweep'\);/);
    expect(sql).toMatch(/SELECT cron\.schedule\('solo-progress-sweep', '\d+ \d+ \* \* \*', \$\$SELECT public\.solo_progress_sweep\(\)\$\$\);/);
    expect(sql).not.toContain("FUNCTION public.retention_sweep");
    expect(sql).not.toMatch(/DELETE FROM (?!solo_progress)/);
  });
});
