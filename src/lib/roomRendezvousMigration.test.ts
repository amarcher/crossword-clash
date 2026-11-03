import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The room rendezvous migration (docs/friends-spec.md §3.7) is SQL, which
 * vitest cannot run, but its shape is a promise to the client and the push
 * sender: the invitee's answer is written only by the RPC and can only be
 * "declined", a nudge comes only from a waiting joiner who is not the host,
 * at most one every 3 minutes, never for a blocked pair, and the nudge table
 * has no client policy. These tests read the file and hold it to those
 * promises (the friends migration test's pattern).
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261103000000_room_rendezvous.sql"), "utf8");
const section = (from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from)));
const fn = (name: string) => section(`CREATE OR REPLACE FUNCTION public.${name}(`, `REVOKE ALL ON FUNCTION public.${name}(`);

describe("room rendezvous migration: the decline", () => {
  it("adds a response column that admits only 'declined'", () => {
    expect(sql).toContain("ALTER TABLE room_invites ADD COLUMN IF NOT EXISTS response TEXT CHECK (response IN ('declined'));");
  });

  it("lets only the recipient answer, only a room invite, only with 'declined', and marks it seen", () => {
    const body = fn("respond_room_invite");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public, pg_temp");
    expect(body).toContain("RAISE EXCEPTION 'friends:not_signed_in'");
    expect(body).toMatch(/IF p_response IS DISTINCT FROM 'declined' THEN\s+RAISE EXCEPTION 'friends:invalid'/);
    expect(body).toMatch(/UPDATE room_invites SET response = p_response, seen_at = coalesce\(seen_at, now\(\)\)\s+WHERE id = p_invite AND to_user_id = uid AND kind = 'room';/);
    expect(body).toContain("RAISE EXCEPTION 'friends:not_found'");
  });
});

describe("room rendezvous migration: the nudge", () => {
  it("creates room_nudges with RLS on and no client policy, cascading from the game and from auth.users on both sides", () => {
    const table = section("CREATE TABLE IF NOT EXISTS room_nudges (", "ALTER TABLE room_nudges");
    expect(table).toContain("game_id      UUID NOT NULL REFERENCES games (id) ON DELETE CASCADE");
    expect(table).toContain("from_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE");
    expect(table).toContain("to_user_id   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE");
    expect(table).toContain("CHECK (from_user_id <> to_user_id)");
    expect(sql).toContain("ALTER TABLE room_nudges ENABLE ROW LEVEL SECURITY;");
    expect(sql).not.toMatch(/CREATE POLICY/);
    // Nothing else in the file sneaks a text column onto a nudge.
    expect(table).not.toMatch(/\b(message|note|body|text)\b/i);
  });

  it("nudge_host: a signed-in player (not the host) of a waiting room, one per 3 minutes, nothing for a blocked pair", () => {
    const body = fn("nudge_host");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public, pg_temp");
    expect(body).toContain("nudge_cooldown CONSTANT INTERVAL := INTERVAL '3 minutes';");
    expect(body).toContain("RAISE EXCEPTION 'friends:not_signed_in'");
    expect(body).toContain("room.status <> 'waiting'");
    expect(body).toContain("RAISE EXCEPTION 'friends:room_not_open'");
    expect(body).toMatch(/IF room\.host_user_id IS NULL OR room\.host_user_id = uid THEN\s+RAISE EXCEPTION 'friends:not_found'/);
    expect(body).toMatch(/SELECT 1 FROM players pl WHERE pl\.game_id = p_game_id AND pl\.user_id = uid\)\s+THEN\s+RAISE EXCEPTION 'friends:not_in_room'/);
    expect(body).toMatch(/IF friends_blocked\(uid, room\.host_user_id\) THEN\s+RETURN NULL;/);
    expect(body).toMatch(/n\.created_at > now\(\) - nudge_cooldown\s+\) THEN\s+RAISE EXCEPTION 'friends:too_soon'/);
    expect(body).toMatch(/INSERT INTO room_nudges \(game_id, from_user_id, to_user_id\)\s+VALUES \(p_game_id, uid, room\.host_user_id\)/);
    // The cooldown is checked before the write and nothing else writes.
    expect(body.indexOf("friends:too_soon")).toBeLessThan(body.indexOf("INSERT INTO room_nudges"));
  });

  it("revokes both RPCs from PUBLIC and grants them to authenticated and the service role", () => {
    for (const sig of ["respond_room_invite(UUID, TEXT)", "nudge_host(UUID)"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated, service_role;`);
    }
  });
});

describe("room rendezvous migration: the push log", () => {
  it("admits the two new kinds the sender logs, keeping the four old ones", () => {
    expect(sql).toContain("ALTER TABLE push_log DROP CONSTRAINT IF EXISTS push_log_kind_check;");
    expect(sql).toContain("CHECK (kind IN ('daily_reminder', 'room_invite', 'beat', 'friend_request', 'room_joined', 'room_nudge'))");
  });

  it("installs no webhook trigger itself: the secret lives in the hand-run docs files", () => {
    expect(sql).not.toMatch(/net\.http_post|x-push-secret|CREATE TRIGGER/i);
    for (const file of ["push-setup-players.sql", "push-setup-nudges.sql"]) {
      const trigger = readFileSync(here(`../../docs/${file}`), "utf8");
      expect(trigger).toContain("pg_get_functiondef('public.room_invites_push'::regproc)");
      expect(trigger).not.toMatch(/[0-9a-f]{64}/);
    }
    const players = readFileSync(here("../../docs/push-setup-players.sql"), "utf8");
    expect(players).toContain("g.status = 'waiting'");
    expect(players).toContain("host = new.user_id");
    expect(players).toContain("select 1 from profiles p where p.user_id = host");
    expect(players).toContain("'kind', 'room_joined', 'gameId', new.game_id, 'joinerUserId', new.user_id");
    expect(players).toContain("after insert on public.players");
    const nudges = readFileSync(here("../../docs/push-setup-nudges.sql"), "utf8");
    expect(nudges).toContain("'table', 'room_nudges'");
    expect(nudges).toContain("after insert on public.room_nudges");
  });
});
