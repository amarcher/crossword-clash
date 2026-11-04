import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The anon-revoke migration is a list of REVOKEs and nothing else: every RPC
 * that needs a session loses the anonymous role's EXECUTE (Supabase's default
 * grant survives a revoke from PUBLIC), while the functions RLS policies and
 * column defaults run as the querying role are left alone.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261104100000_rpc_anon_revoke.sql"), "utf8");
const statements = sql.split("\n").filter((l) => l.trim() && !l.startsWith("--"));

describe("rpc anon revoke migration", () => {
  it("only revokes, only from anon (and PUBLIC on the one function that still had it), one line per session RPC", () => {
    expect(statements.length).toBe(18);
    for (const line of statements) expect(line).toMatch(/^REVOKE EXECUTE ON FUNCTION public\.\w+\([^)]*\) FROM (PUBLIC, )?anon;$/);
    expect(sql).not.toMatch(/GRANT|CREATE|ALTER|DROP|FROM authenticated|FROM service_role/);
    const names = statements.map((l) => l.match(/public\.(\w+)\(/)![1]);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ["send_friend_request", "respond_friend_request", "recent_opponents", "invite_to_room", "send_beat", "mark_invites_seen", "respond_room_invite", "nudge_host", "accept_publishing_terms", "publish_puzzle", "unpublish_puzzle", "report_puzzle", "record_solves", "claim_cell"]) {
      expect(names).toContain(name);
    }
    // Read by RLS as the querying role, or a column default: untouched.
    for (const name of ["has_entitlement", "community_short_id", "friend_solves"]) expect(names).not.toContain(name);
  });
});
