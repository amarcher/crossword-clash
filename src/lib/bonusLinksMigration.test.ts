import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Daily Plus links work as the other puzzles' do (20261130000000_bonus_links.sql):
 * a race reply and a friend invite may name a bonus day, and the one free read
 * of other accounts' recordings never returns a bonus's letters without Plus.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261130000000_bonus_links.sql"), "utf8");
const before = readFileSync(here("../../supabase/migrations/20261129000000_friend_race.sql"), "utf8");
const fn = (name: string) => sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`), sql.indexOf("$$;", sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)));

describe("bonus_links migration", () => {
  it("lets a race reply name a Daily Plus day under slot 'bonus', and changes nothing else about the table", () => {
    expect(sql).toContain("ALTER TABLE race_replies DROP CONSTRAINT IF EXISTS race_replies_slot_check;");
    expect(sql).toContain("ALTER TABLE race_replies ADD CONSTRAINT race_replies_slot_check CHECK (slot IN ('mini', 'midi', 'large', 'bonus'));");
    expect(sql).not.toMatch(/CREATE TABLE|CREATE POLICY|DROP TABLE|DROP FUNCTION|reply_to_race\(/);
  });

  it("send_beat takes a released Daily Plus day's link besides a daily's and a published community puzzle's, and nothing else", () => {
    const body = fn("send_beat");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public, pg_temp");
    expect(body).toContain("uid UUID := friends_account_id();");
    expect(body).toContain("'^/daily/\\d{4}-\\d{2}-\\d{2}/(mini|midi|large)(\\?[A-Za-z0-9=&%._+-]*)?$'");
    expect(body).toContain("'^/puzzles/([a-z0-9]{8})(\\?[A-Za-z0-9=&%._+-]*)?$'");
    expect(body).toContain("'^/bonus/(\\d{4}-\\d{2}-\\d{2})(\\?[A-Za-z0-9=&%._+-]*)?$'");
    // The released view, not the table: a day still to come is no link.
    expect(body).toContain("NOT EXISTS (SELECT 1 FROM bonus_cards b WHERE b.day::text = bonus_day)");
    expect(body).toContain("p.status = 'published'");
    // Friends only, nothing across a block, under the invite limits, as before.
    expect(body).toContain("RAISE EXCEPTION 'friends:not_friends';");
    expect(body).toContain("IF friends_blocked(uid, p_friend) THEN");
    expect(body).toContain("PERFORM friends_check_invite_limits(uid);");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.send_beat(UUID, TEXT) FROM anon;");
  });

  it("friend_race keeps a Daily Plus recording's letters from a caller without Plus, and is otherwise the function it replaces", () => {
    const body = fn("friend_race");
    expect(body).toContain("NOT EXISTS (SELECT 1 FROM bonus_puzzles b WHERE b.identity = p_puzzle_key)");
    expect(body).toContain("OR has_entitlement(uid, 'plus')");
    // Friends only, under each friend's own setting, stripped unless finished: unchanged.
    for (const kept of [
      "uid UUID := friends_account_id();",
      "SELECT 1 FROM solves s WHERE s.user_id = uid AND s.puzzle_key = p_puzzle_key AND s.mode <> 'import'",
      "jsonb_build_array(e -> 0, e -> 1, CASE WHEN e ->> 2 = '' THEN 0 ELSE 1 END)",
      "AND races_are_friends(uid, t.user_id)",
      "AND races_visible(uid, t.user_id)",
      "LIMIT 11;",
    ]) {
      expect(before).toContain(kept);
      expect(body).toContain(kept);
    }
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.friend_race(TEXT) FROM anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.friend_race(TEXT) TO authenticated, service_role;");
    expect(sql).not.toMatch(/TO anon/);
  });
});
