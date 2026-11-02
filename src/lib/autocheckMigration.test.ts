import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The autocheck migration is SQL, which vitest cannot run; these tests read it
 * and hold it to the client's contract: a nullable boolean on both tables
 * that carry solo finishes, defaulting to true so every older row (and every
 * row from an older client) reads as made with autocheck on — and nothing else
 * touched, so applying it first is safe for the client already deployed.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261028100000_autocheck.sql"), "utf8");

describe("autocheck migration", () => {
  it("adds a nullable autocheck boolean defaulting to true to play_sessions and daily_results", () => {
    expect(sql).toMatch(/ALTER TABLE play_sessions\s+ADD COLUMN IF NOT EXISTS autocheck BOOLEAN DEFAULT true;/);
    expect(sql).toMatch(/ALTER TABLE daily_results\s+ADD COLUMN IF NOT EXISTS autocheck BOOLEAN DEFAULT true;/);
    // Nullable on purpose: NOT NULL would rewrite every existing row.
    expect(sql).not.toMatch(/autocheck BOOLEAN NOT NULL/);
  });

  it("changes nothing else: no other tables, policies, functions or data", () => {
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--") && line.trim() !== "")
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(sql).not.toMatch(/CREATE|DROP|UPDATE|DELETE|INSERT|POLICY|FUNCTION/);
  });

  it("tells the deployer to apply it before the client that sends the column", () => {
    expect(sql).toMatch(/BEFORE the client/);
    expect(sql).toContain("npx supabase db push");
  });
});
