import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The room rendezvous migration (docs/friends-spec.md §3.7) is SQL, which
 * vitest cannot run, but its shape is a promise to the client and the push
 * sender: the invitee's answer is written only by the RPC and can only be
 * "declined", a nudge comes only from a waiting joiner who is not the host,
 * with an escalating wait per away spell (1, 2, 4, 8, 15 minutes) under a
 * one-minute floor whatever spell is claimed, the refusal says how long is
 * left, nothing is written for a blocked pair, and the nudge table has no
 * client policy. These tests read the file and hold it to those
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

  it("nudge_host: a signed-in player (not the host) of a waiting room, nothing written for a blocked pair", () => {
    const body = fn("nudge_host");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public, pg_temp");
    expect(body).toContain("RAISE EXCEPTION 'friends:not_signed_in'");
    expect(body).toContain("room.status <> 'waiting'");
    expect(body).toContain("RAISE EXCEPTION 'friends:room_not_open'");
    expect(body).toMatch(/IF room\.host_user_id IS NULL OR room\.host_user_id = uid THEN\s+RAISE EXCEPTION 'friends:not_found'/);
    expect(body).toMatch(/SELECT 1 FROM players pl WHERE pl\.game_id = p_game_id AND pl\.user_id = uid\)\s+THEN\s+RAISE EXCEPTION 'friends:not_in_room'/);
    expect(body).toMatch(/IF NOT friends_blocked\(uid, room\.host_user_id\) THEN\s+INSERT INTO room_nudges \(game_id, from_user_id, to_user_id, spell_started_at\)\s+VALUES \(p_game_id, uid, room\.host_user_id, p_spell\)/);
    expect(body.match(/INSERT INTO/g)).toHaveLength(1);
  });

  it("nudge_host: the ladder is 1, 2, 4, 8, 15 minutes per away spell under a one-minute floor, checked before the write, and the refusal carries the seconds left", () => {
    const body = fn("nudge_host");
    expect(body).toContain("nudge_backoff CONSTANT INTERVAL[] := ARRAY['1 minute', '2 minutes', '4 minutes', '8 minutes', '15 minutes']::INTERVAL[];");
    expect(body).toContain("nudge_floor CONSTANT INTERVAL := INTERVAL '1 minute';");
    // The spell's own rows set the step; any row of the caller in the room sets the floor.
    expect(body).toContain("n.spell_started_at IS NOT DISTINCT FROM p_spell");
    expect(body).toContain("last_in_spell + nudge_backoff[least(spell_count, array_length(nudge_backoff, 1))]");
    expect(body).toContain("last_any + nudge_floor");
    expect(body).toContain("RAISE EXCEPTION 'friends:too_soon:%', ceil(extract(epoch FROM (next_at - now())))::INTEGER;");
    expect(body.indexOf("friends:too_soon")).toBeLessThan(body.indexOf("INSERT INTO room_nudges"));
    // The answer names the next wait so the lobby can count down from the server's ladder.
    expect(body).toContain("RETURNS JSONB");
    expect(body).toContain("'nextInSeconds', extract(epoch FROM nudge_backoff[least(spell_count + 1, array_length(nudge_backoff, 1))])::INTEGER");
    expect(section("CREATE TABLE IF NOT EXISTS room_nudges (", "ALTER TABLE room_nudges")).toContain("spell_started_at TIMESTAMPTZ");
  });

  it("revokes both RPCs from PUBLIC and grants them to authenticated and the service role", () => {
    for (const sig of ["respond_room_invite(UUID, TEXT)", "nudge_host(UUID, TIMESTAMPTZ)"]) {
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
