import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The room-solves read is the second read of `solves` across accounts, so its
 * shape is a promise: only the room's host or a player may ask, only the
 * room's players are answered, never an `import` row, never a time, one row
 * per player, revoked from anon.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261104200000_room_solves.sql"), "utf8");

describe("room_solves migration", () => {
  it("is a SECURITY DEFINER read with a pinned search path, for a signed-in host or player of the room only", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.room_solves(p_game_id UUID, p_puzzle_key TEXT)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(sql).toContain("RAISE EXCEPTION 'friends:not_signed_in'");
    expect(sql).toContain("g.host_user_id = uid OR EXISTS (SELECT 1 FROM players p WHERE p.game_id = g.id AND p.user_id = uid)");
    expect(sql).toContain("RAISE EXCEPTION 'friends:not_a_member'");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.room_solves(UUID, TEXT) FROM anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.room_solves(UUID, TEXT) TO authenticated, service_role;");
  });

  it("answers the room's players only, their latest finish, never an import row and never a time", () => {
    expect(sql).toContain("FROM players p\n  JOIN solves s ON s.user_id = p.user_id\n  WHERE p.game_id = p_game_id");
    expect(sql).toContain("s.mode <> 'import'");
    expect(sql).toContain("SELECT DISTINCT ON (s.user_id) s.user_id, s.mode");
    expect(sql).toContain("RETURNS TABLE (user_id UUID, mode TEXT)");
    expect(sql).not.toMatch(/seconds|CREATE TABLE|CREATE POLICY/);
  });
});
