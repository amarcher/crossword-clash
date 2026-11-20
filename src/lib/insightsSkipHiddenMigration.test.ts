import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The studio's insights count players, not the hidden test accounts that are
 * driven through real puzzles to check builds and capture screenshots.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261204000000_insights_skip_hidden.sql"), "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "");

describe("insights skip hidden profiles migration", () => {
  it("leaves a hidden profile's play sessions out of the per-puzzle counts and the per-clue ones", () => {
    expect(statements).toContain("FROM play_sessions WHERE started_at >= p_from AND started_at < p_to AND NOT is_hidden_user(user_id)");
    expect(statements).toMatch(/ps\.started_at < p_to\s+AND NOT is_hidden_user\(ps\.user_id\)/);
  });

  it("leaves a hidden profile's narrator starts out too", () => {
    expect(statements).toContain("n.created_at < p_to AND NOT is_hidden_user(n.user_id)");
  });

  it("replaces the functions in place, so their privileges stand", () => {
    expect(statements.match(/CREATE OR REPLACE FUNCTION public\.insights_(puzzles|clues)/g)).toHaveLength(2);
    expect(statements).not.toMatch(/\bGRANT\b|\bDROP FUNCTION\b/);
  });
});
