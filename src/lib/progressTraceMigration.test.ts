import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** A puzzle in progress carries its solve recording: one nullable, bounded column. */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261128000000_progress_trace.sql"), "utf8");
const statements = sql.replace(/^--.*$/gm, "");

describe("progress trace migration", () => {
  it("adds a nullable trace column with a size bound, and nothing else", () => {
    expect(statements).toContain("ALTER TABLE solo_progress ADD COLUMN IF NOT EXISTS trace JSONB;");
    expect(statements).toMatch(/CHECK \(trace IS NULL OR pg_column_size\(trace\) <= 131072\)/);
    expect(statements).not.toMatch(/POLICY|NOT NULL|DROP TABLE|DROP COLUMN/);
  });
});
