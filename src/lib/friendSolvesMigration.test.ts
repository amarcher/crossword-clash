import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The friends' solves read (docs/friends-spec.md §3.8) is the one read of
 * `solves` across accounts, so its shape is a promise: accepted friends only,
 * neither side blocked, never the caller's own rows, never an `import` row,
 * never a time, one row per friend, and only a signed-in account may ask.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261104000000_friend_solves.sql"), "utf8");

describe("friend_solves migration", () => {
  it("is a SECURITY DEFINER read with a pinned search path that only a signed-in account may call", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.friend_solves(p_puzzle_key TEXT)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("STABLE");
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(sql).toContain("uid UUID := friends_account_id();");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.friend_solves(TEXT) FROM PUBLIC;");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.friend_solves(TEXT) FROM anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.friend_solves(TEXT) TO authenticated, service_role;");
    expect(sql).not.toMatch(/TO anon/);
  });

  it("answers only accepted friends, neither side blocked, never the caller, never an import row, one row per friend, and no time", () => {
    expect(sql).toContain("f.status = 'accepted'");
    expect(sql).toContain("(f.requester_id = uid AND f.recipient_id = s.user_id) OR (f.recipient_id = uid AND f.requester_id = s.user_id)");
    expect(sql).toContain("NOT friends_blocked(uid, s.user_id)");
    expect(sql).toContain("s.user_id <> uid");
    expect(sql).toContain("s.mode <> 'import'");
    expect(sql).toContain("SELECT DISTINCT ON (s.user_id) s.user_id, s.mode, s.completed_day");
    expect(sql).toContain("RETURNS TABLE (user_id UUID, mode TEXT, completed_day DATE)");
    expect(sql).not.toMatch(/seconds/);
    // Nothing but the function: no table, no policy, no trigger.
    expect(sql).not.toMatch(/CREATE TABLE|CREATE POLICY|CREATE TRIGGER/);
  });
});
