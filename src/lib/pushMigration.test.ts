import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The push migration is SQL, which vitest cannot run, but its shape is a
 * promise to the client and the sender (docs/friends-spec.md §5): a device
 * writes only its own token row, the log is never readable by a client, the
 * reminder targets are chosen in the player's own time zone, and the sweep
 * touches only what this migration added.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261102000000_push.sql"), "utf8");
const section = (from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from)));
const fn = (name: string) => section(`CREATE OR REPLACE FUNCTION public.${name}(`, `REVOKE ALL ON FUNCTION public.${name}(`);

describe("push migration: tables", () => {
  it("creates the three tables with RLS on, each cascading from auth.users (anonymous users may hold a token)", () => {
    for (const table of ["device_tokens", "notification_preferences", "push_log"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(sql.match(/REFERENCES auth\.users \(id\) ON DELETE CASCADE/g)).toHaveLength(3);
    expect(sql).not.toContain("REFERENCES profiles");
  });

  it("lets a device manage only its own token row and preferences, and gives clients nothing on the log", () => {
    const policies = [...sql.matchAll(/CREATE POLICY "[^"]+"\s+ON (\w+) FOR (\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(policies).toEqual([
      "device_tokens:SELECT",
      "device_tokens:INSERT",
      "device_tokens:UPDATE",
      "device_tokens:DELETE",
      "notification_preferences:SELECT",
      "notification_preferences:INSERT",
      "notification_preferences:UPDATE",
    ]);
    expect(sql).toMatch(/ON device_tokens FOR INSERT\s+WITH CHECK \(\(select auth\.uid\(\)\) = user_id\);/);
    expect(sql).not.toMatch(/ON push_log FOR/);
  });

  it("keys a token to one row, bounds the vocabularies, and stores no notification text", () => {
    expect(sql).toContain("token        TEXT NOT NULL UNIQUE");
    expect(sql).toContain("CHECK (platform IN ('ios', 'android'))");
    expect(sql).toContain("CHECK (locale IN ('en', 'es'))");
    expect(sql).toContain("CHECK (daily_reminder_hour BETWEEN 0 AND 23)");
    const log = section("CREATE TABLE IF NOT EXISTS push_log", "ALTER TABLE push_log");
    expect(log).not.toMatch(/\b(title|body|text|message)\b/);
    expect(log).toContain("CHECK (outcome IN ('sent', 'unregistered', 'failed', 'quiet', 'opted_out', 'no_token'))");
  });

  it("defaults the reminder off and the invite switches on, with quiet hours 22–8 that room invites may cross", () => {
    const prefs = section("CREATE TABLE IF NOT EXISTS notification_preferences", "ALTER TABLE notification_preferences");
    expect(prefs).toContain("daily_reminder      BOOLEAN NOT NULL DEFAULT false");
    expect(prefs).toContain("room_invites        BOOLEAN NOT NULL DEFAULT true");
    expect(prefs).toContain("quiet_start         SMALLINT NOT NULL DEFAULT 22");
    expect(prefs).toContain("quiet_end           SMALLINT NOT NULL DEFAULT 8");
    expect(prefs).toContain("quiet_allow_invites BOOLEAN NOT NULL DEFAULT true");
  });
});

describe("push migration: the sender's reads", () => {
  it("picks reminder targets by the player's local hour and skips anyone who finished a daily today, service role only", () => {
    const body = fn("push_reminder_targets");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("extract(hour FROM now() AT TIME ZONE np.timezone)::int = np.daily_reminder_hour");
    expect(body).toContain("WHERE np.daily_reminder");
    expect(body).toContain("dt.failed_at IS NULL");
    expect(body).toContain("s.source = 'daily'");
    expect(body).toContain("s.completed_day = (now() AT TIME ZONE np.timezone)::date");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.push_reminder_targets() FROM PUBLIC, anon, authenticated;");
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.push_reminder_targets/);
  });
});

describe("push migration: push_sweep()", () => {
  const sweep = fn("push_sweep");

  it("names its windows and deletes only from the tables this migration added", () => {
    expect(sweep).toContain("device_token_ttl CONSTANT INTERVAL := INTERVAL '90 days';");
    expect(sweep).toContain("failed_token_ttl CONSTANT INTERVAL := INTERVAL '7 days';");
    expect(sweep).toContain("push_log_ttl CONSTANT INTERVAL := INTERVAL '30 days';");
    expect([...sweep.matchAll(/DELETE FROM (\w+)/g)].map((m) => m[1])).toEqual(["device_tokens", "device_tokens", "push_log"]);
    expect(sweep).toContain("WHERE last_seen_at < now() - device_token_ttl");
  });

  it("runs on its own nightly cron job and leaves retention_sweep() alone", () => {
    expect(sql).toContain("SELECT cron.schedule('push-sweep', '7 5 * * *', $$SELECT public.push_sweep()$$);");
    expect(sql).toContain("cron.unschedule('push-sweep')");
    expect(sql).not.toContain("FUNCTION public.retention_sweep");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.push_sweep() FROM PUBLIC, anon, authenticated;");
  });
});
