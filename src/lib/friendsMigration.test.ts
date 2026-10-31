import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The friends migration is SQL, which vitest cannot run, but its shape is a
 * promise to the client (docs/friends-spec.md §5): every user-id column
 * cascades from profiles, nothing but the RPCs writes a request or an invite,
 * the blocked side can never read a block, invites carry no free text, and the
 * sweep touches only what this migration added. These tests read the file and
 * hold it to those promises (the community migration test's pattern).
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261101000000_friends.sql"), "utf8");

const section = (from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from)));
const fn = (name: string) => section(`CREATE OR REPLACE FUNCTION public.${name}(`, `REVOKE ALL ON FUNCTION public.${name}(`);

describe("friends migration: tables", () => {
  it("creates the four tables with RLS on", () => {
    for (const table of ["friendships", "blocks", "room_invites", "request_cooldowns"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it("keys every user-id column to profiles so a username is required and deleting the account cascades", () => {
    const columns = [...sql.matchAll(/^\s+(\w+_id)\s+UUID[^\n]*REFERENCES (\w+) \((\w+)\)([^\n]*)$/gm)];
    const userColumns = columns.filter((m) => m[1] !== "game_id");
    expect(userColumns.length).toBe(8);
    for (const m of userColumns) {
      expect(m[2]).toBe("profiles");
      expect(m[4]).toContain("ON DELETE CASCADE");
    }
    expect(section("CREATE TABLE IF NOT EXISTS room_invites", "ALTER TABLE room_invites")).toContain("game_id      UUID REFERENCES games (id) ON DELETE CASCADE");
  });

  it("gives clients only the policies the spec allows: parties read and delete friendships, blockers own their blocks, parties read and recipients delete invites, nothing on cooldowns", () => {
    const policies = [...sql.matchAll(/CREATE POLICY "[^"]+"\s+ON (\w+) FOR (\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(policies).toEqual([
      "friendships:SELECT",
      "friendships:DELETE",
      "blocks:SELECT",
      "blocks:INSERT",
      "blocks:DELETE",
      "room_invites:SELECT",
      "room_invites:DELETE",
    ]);
    expect(sql).toMatch(/ON blocks FOR SELECT\s+USING \(\(select auth\.uid\(\)\) = blocker_id\);/);
    expect(sql).toMatch(/ON room_invites FOR DELETE\s+USING \(\(select auth\.uid\(\)\) = to_user_id\);/);
  });

  it("keeps one friendship per pair whichever way it was asked, and one room invite per friend per room", () => {
    expect(sql).toContain("ON friendships (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))");
    expect(sql).toContain("ON room_invites (game_id, to_user_id) WHERE kind = 'room'");
  });

  it("gives an invite no text column and ties the link to the beat kind", () => {
    const invites = section("CREATE TABLE IF NOT EXISTS room_invites", "ALTER TABLE room_invites");
    expect(invites).not.toMatch(/\b(message|note|body|text)\b/);
    expect(invites).toContain("CHECK ((kind = 'room') = (game_id IS NOT NULL))");
    expect(invites).toContain("CHECK ((kind = 'beat') = (link IS NOT NULL))");
  });
});

describe("friends migration: the writes", () => {
  const rpcs = ["send_friend_request", "respond_friend_request", "recent_opponents", "invite_to_room", "send_beat", "mark_invites_seen"];

  it("makes every write SECURITY DEFINER with the search path pinned, revoked from PUBLIC and granted to authenticated", () => {
    for (const name of rpcs) {
      const body = fn(name);
      expect(body, name).toContain("SECURITY DEFINER");
      expect(body, name).toContain("SET search_path = public, pg_temp");
      expect(sql, name).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated, service_role;`));
    }
    // The helpers are internal.
    for (const helper of ["friends_account_id", "friends_blocked", "friends_check_invite_limits"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${helper}\\([^)]*\\) FROM PUBLIC;`));
      expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${helper}\\(`));
    }
  });

  it("requires a real account with a username for anything but marking invites seen", () => {
    const account = fn("friends_account_id");
    expect(account).toContain("is_anonymous");
    expect(account).toContain("RAISE EXCEPTION 'friends:not_signed_in'");
    expect(account).toContain("RAISE EXCEPTION 'friends:no_username'");
    for (const name of ["send_friend_request", "respond_friend_request", "recent_opponents", "invite_to_room", "send_beat"]) {
      expect(fn(name), name).toContain("uid UUID := friends_account_id();");
    }
  });

  it("answers a blocked requester or inviter as if it had worked and writes nothing (spec §8)", () => {
    const request = fn("send_friend_request");
    expect(request).toMatch(/IF friends_blocked\(uid, target\) THEN\s+RETURN 'sent';/);
    expect(request).toMatch(/cooldown\.until = 'infinity'::timestamptz THEN\s+RETURN 'sent';/);
    expect(fn("invite_to_room")).toMatch(/IF friends_blocked\(uid, p_friend\) THEN\s+RETURN NULL;/);
    expect(fn("send_beat")).toMatch(/IF friends_blocked\(uid, p_friend\) THEN\s+RETURN NULL;/);
  });

  it("holds the spec's limits as named constants: 20 requests a day, 100 pending, a 7-day cooldown, silence after 3 declines, 20 invites an hour and 50 a day", () => {
    const request = fn("send_friend_request");
    expect(request).toContain("requests_per_day CONSTANT INTEGER := 20;");
    expect(request).toContain("max_pending CONSTANT INTEGER := 100;");
    const respond = fn("respond_friend_request");
    expect(respond).toContain("decline_cooldown CONSTANT INTERVAL := INTERVAL '7 days';");
    expect(respond).toContain("declines_before_silence CONSTANT INTEGER := 3;");
    const limits = fn("friends_check_invite_limits");
    expect(limits).toContain("invites_per_hour CONSTANT INTEGER := 20;");
    expect(limits).toContain("invites_per_day CONSTANT INTEGER := 50;");
    for (const name of ["invite_to_room", "send_beat"]) expect(fn(name), name).toContain("PERFORM friends_check_invite_limits(uid);");
  });

  it("accepts a request the other side had already made, refuses a repeat, and only invites accepted friends into a waiting room the caller is in", () => {
    const request = fn("send_friend_request");
    expect(request).toContain("RAISE EXCEPTION 'friends:already_requested'");
    expect(request).toMatch(/UPDATE friendships SET status = 'accepted', responded_at = now\(\)\s+WHERE requester_id = target AND recipient_id = uid;\s+RETURN 'accepted';/);
    const invite = fn("invite_to_room");
    expect(invite).toContain("room.status <> 'waiting'");
    expect(invite).toContain("RAISE EXCEPTION 'friends:not_in_room'");
    expect(invite).toContain("RAISE EXCEPTION 'friends:not_friends'");
    expect(invite).toContain("RAISE EXCEPTION 'friends:already_invited'");
  });

  it("lets a beat invite carry only the site's daily challenge path", () => {
    expect(fn("send_beat")).toContain("p_link !~ '^/daily/\\d{4}-\\d{2}-\\d{2}/(mini|midi|large)(\\?[A-Za-z0-9=&%._+-]*)?$'");
  });

  it("lists recent opponents from the caller's own games, skipping anonymous players and blocked people", () => {
    const body = fn("recent_opponents");
    expect(body).toContain("JOIN profiles pr ON pr.user_id = other.user_id");
    expect(body).toContain("WHERE NOT friends_blocked(uid, other.user_id)");
    expect(body).toContain("SELECT g.id FROM games g WHERE g.host_user_id = uid");
  });
});

describe("friends migration: friends_sweep()", () => {
  const sweep = fn("friends_sweep");

  it("names its windows and touches only the tables this migration added", () => {
    expect(sweep).toContain("friend_request_ttl CONSTANT INTERVAL := INTERVAL '30 days';");
    expect(sweep).toContain("room_invite_ttl CONSTANT INTERVAL := INTERVAL '7 days';");
    const targets = [...sweep.matchAll(/DELETE FROM (\w+)/g)].map((m) => m[1]);
    expect(targets).toEqual(["friendships", "request_cooldowns", "room_invites"]);
    expect(sweep).toContain("WHERE status = 'pending' AND created_at < now() - friend_request_ttl");
    expect(sweep).not.toContain("UPDATE ");
  });

  it("runs on its own nightly cron job after the other sweeps, leaving retention_sweep() alone", () => {
    expect(sql).toContain("SELECT cron.schedule('friends-sweep', '57 4 * * *', $$SELECT public.friends_sweep()$$);");
    expect(sql).toContain("cron.unschedule('friends-sweep')");
    expect(sql).not.toContain("FUNCTION public.retention_sweep");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.friends_sweep() FROM PUBLIC, anon, authenticated;");
  });
});
