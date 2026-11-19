import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The leaderboard follows who may watch a solve: the migration's read rule is
 * the owner's visibility setting, and posting needs an account that is not hidden.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261202000000_board_visibility.sql"), "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "");

describe("board visibility migration", () => {
  it("shows a row to its owner, to everyone, or to the owner's friends, by the owner's setting", () => {
    expect(statements).toContain("COALESCE(auth.uid() = p_owner, false)");
    expect(statements).toContain("p.race_visibility = 'everyone'");
    expect(statements).toContain("p.race_visibility = 'friends' AND auth.uid() IS NOT NULL AND races_are_friends(auth.uid(), p_owner)");
    expect(statements).toContain("SELECT NOT p.hidden");
    expect(statements).toContain("USING (board_row_visible(user_id))");
  });

  it("keeps rows with no profile readable (posted before an account was required)", () => {
    expect(statements).toMatch(/WHERE p\.user_id = p_owner\s*\),\s*true\s*\)/);
  });

  it("lets only an account that is not hidden post or update, and keeps the Daily Plus rule", () => {
    expect(statements).toContain("(auth.jwt() ->> 'is_anonymous')::boolean, false) = false");
    expect(statements).toContain("p.user_id = auth.uid() AND p.race_visibility = 'hidden'");
    expect(statements.match(/auth\.uid\(\) = user_id AND board_can_post\(\) AND \(slot <> 'bonus' OR has_entitlement\(auth\.uid\(\), 'plus'\)\)/g)).toHaveLength(2);
  });
});
