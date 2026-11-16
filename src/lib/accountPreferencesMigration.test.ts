import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PREF_BINDINGS } from "./accountPrefs";

/** The account_preferences migration, held to what the client sends. */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261127000000_account_preferences.sql"), "utf8").replace(/^--.*$/gm, "");

describe("account_preferences migration", () => {
  it("keeps one bounded row per user and preference, gone with the user", () => {
    expect(sql).toContain("PRIMARY KEY (user_id, key)");
    expect(sql).toContain("REFERENCES auth.users (id) ON DELETE CASCADE");
    expect(sql).toMatch(/CHECK \(pg_column_size\(value\) <= \d+\)/);
    for (const { key } of PREF_BINDINGS) expect(sql).toContain(`'${key}'`);
  });

  it("is owner-only for real accounts, with no delete from clients", () => {
    expect(sql).toContain("ALTER TABLE account_preferences ENABLE ROW LEVEL SECURITY;");
    const kinds = [...sql.matchAll(/ON account_preferences FOR (\w+)/g)].map((m) => m[1]);
    expect(kinds).toEqual(["SELECT", "INSERT", "UPDATE"]);
    expect(sql.match(/auth\.uid\(\) = user_id/g)).toHaveLength(4);
    expect(sql.match(/is_anonymous'\)::boolean, false\) = false/g)).toHaveLength(3);
  });
});
