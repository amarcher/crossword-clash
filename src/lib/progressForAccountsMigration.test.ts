import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Puzzles in progress sync for every account: the migration swaps the
 * Plus-only policies for account-only ones and sweeps stale rows for all.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261126100000_progress_for_accounts.sql"), "utf8");
const statements = sql.replace(/^--.*$/gm, "");

describe("progress for accounts migration", () => {
  it("drops the Plus-only policies and asks only for a real account", () => {
    for (const kind of ["read", "insert", "update"]) {
      expect(statements).toContain(`DROP POLICY IF EXISTS "Plus accounts ${kind} own progress" ON solo_progress;`);
      const start = statements.indexOf(`CREATE POLICY "Accounts ${kind} own progress"`);
      expect(start).toBeGreaterThan(-1);
      const policy = statements.slice(start, statements.indexOf(";", start));
      expect(policy).toContain("auth.uid() = user_id");
      expect(policy).toContain("coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false");
    }
    expect(statements).not.toContain("has_entitlement");
  });

  it("sweeps any row untouched for 180 days and stays off the clients' reach", () => {
    expect(statements).toMatch(/stale_progress_ttl CONSTANT INTERVAL := INTERVAL '180 days'/);
    expect(statements).toMatch(/DELETE FROM solo_progress sp\s+WHERE sp\.updated_at < now\(\) - stale_progress_ttl;/);
    expect(statements).toContain("REVOKE ALL ON FUNCTION public.solo_progress_sweep() FROM PUBLIC, anon, authenticated;");
    expect(statements).not.toContain("retention_sweep");
  });
});
