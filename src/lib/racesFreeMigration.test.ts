import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Racing and watching a recorded solve are free: the migration redefines the
 * two functions without the Plus question and keeps every other rule.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261201000000_races_free.sql"), "utf8");
const statements = sql.replace(/^--.*$/gm, "");

describe("races free migration", () => {
  it("asks nothing about Plus", () => {
    expect(statements).not.toContain("has_entitlement");
    expect(statements).not.toContain("plus_required");
  });

  it("keeps the owner's visibility setting and letters only for a caller who has finished", () => {
    expect(statements).toContain("IF NOT races_visible(uid, p_user) THEN");
    expect(statements).toContain("AND races_visible(uid, t.user_id)");
    expect(statements).toMatch(/CASE WHEN finished THEN t\.events/);
  });

  it("gives every caller the times, with both signatures unchanged", () => {
    expect(statements).toContain("SELECT v.user_id, v.username, v.seconds, v.friend");
    expect(statements).toContain("FUNCTION public.race_candidates(p_puzzle_key TEXT)\nRETURNS TABLE (user_id UUID, username TEXT, seconds INT, friend BOOLEAN)");
    expect(statements).toContain("FUNCTION public.solve_trace(p_user UUID, p_puzzle_key TEXT)\nRETURNS TABLE (seconds INT, events JSONB, with_letters BOOLEAN)");
  });
});
