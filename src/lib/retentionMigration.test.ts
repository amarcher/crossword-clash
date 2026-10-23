import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MP_SESSION_MAX_AGE_MS, MP_SESSION_RECENT_MS } from "./sessionPersistence";
import { INSIGHT_RANGES } from "./insights";

/**
 * The retention migration is SQL, which vitest cannot run, but its windows
 * are promises to the client code: a room must outlive the session that could
 * still rejoin it, clue detail must outlive the longest insights range, and
 * the sweep must only ever touch the tables it was written for. These tests
 * read the file and hold it to those promises.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const MIGRATION = here("../../supabase/migrations/20261023000000_retention.sql");
const sql = readFileSync(MIGRATION, "utf8");
const body = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.retention_sweep()"), sql.indexOf("REVOKE ALL ON FUNCTION public.retention_sweep()"));

const UNIT_MS: Record<string, number> = { hour: 3_600_000, day: 86_400_000, year: 365 * 86_400_000 };

/** `name CONSTANT INTERVAL := INTERVAL '12 hours'` → { name: ms }. */
function intervalConstants(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/(\w+) CONSTANT INTERVAL := INTERVAL '(\d+) (hour|day|year)s?'/g)) {
    out[m[1]] = Number(m[2]) * UNIT_MS[m[3]];
  }
  return out;
}
const ttl = intervalConstants(body);
const DAY = UNIT_MS.day;

describe("retention migration: windows", () => {
  it("names every window as a constant", () => {
    expect(Object.keys(ttl).sort()).toEqual(
      [
        "active_room_ttl",
        "finished_game_ttl",
        "idle_anonymous_user_ttl",
        "narrator_usage_ttl",
        "orphan_puzzle_grace",
        "play_session_clues_ttl",
        "play_session_ttl",
        "waiting_room_ttl",
      ].sort(),
    );
    // Every constant is used in a WHERE clause.
    for (const name of Object.keys(ttl)) expect(body.match(new RegExp(`now\\(\\) - ${name}\\b`, "g"))?.length ?? 0).toBeGreaterThan(0);
  });

  it("keeps rooms past the sessions that could still rejoin them, with margin", () => {
    // A waiting room is only auto-rejoined within MP_SESSION_RECENT_MS.
    expect(ttl.waiting_room_ttl).toBeGreaterThanOrEqual(2 * MP_SESSION_RECENT_MS);
    // An active room can be rejoined from a session up to MP_SESSION_MAX_AGE_MS old.
    expect(ttl.active_room_ttl).toBeGreaterThanOrEqual(2 * MP_SESSION_MAX_AGE_MS);
    expect(ttl.finished_game_ttl).toBe(90 * DAY);
  });

  it("keeps clue detail for longer than the insights panel can ask for, and rows longer than detail", () => {
    expect(ttl.play_session_clues_ttl).toBeGreaterThan(Math.max(...INSIGHT_RANGES) * DAY);
    expect(ttl.play_session_ttl).toBeGreaterThan(ttl.play_session_clues_ttl);
  });

  it("keeps narrator_usage past the 30-day demo-grant window and anonymous users for 30 days", () => {
    const rateLimit = readFileSync(here("../../supabase/functions/_shared/rateLimit.ts"), "utf8");
    const demoDays = Number(/DEMO_WINDOW_MS = (\d+) \* 24 \* 3_600_000/.exec(rateLimit)?.[1]);
    expect(demoDays).toBe(30);
    expect(ttl.narrator_usage_ttl).toBeGreaterThan(demoDays * DAY);
    expect(ttl.idle_anonymous_user_ttl).toBe(30 * DAY);
    expect(ttl.orphan_puzzle_grace).toBeGreaterThanOrEqual(UNIT_MS.hour);
  });
});

describe("retention migration: what the sweep touches", () => {
  it("only deletes from the tables it was written for, and only updates games and play_sessions", () => {
    const deletes = [...body.matchAll(/DELETE FROM ([\w.]+)/g)].map((m) => m[1]);
    expect(deletes).toEqual(["games", "puzzles", "auth.users", "narrator_usage", "play_sessions"]);
    const updates = [...body.matchAll(/UPDATE (\w+) SET/g)].map((m) => m[1]);
    expect(updates).toEqual(["games", "games", "play_sessions"]);
  });

  it("closes stale rooms before deleting finished games, and only deletes closed or completed ones", () => {
    const close = body.indexOf("SET status = 'closed'");
    const del = body.indexOf("DELETE FROM games");
    expect(close).toBeGreaterThan(-1);
    expect(close).toBeLessThan(del);
    expect(body).toMatch(/DELETE FROM games\s+WHERE status IN \('closed', 'completed'\)/);
    expect(body).toMatch(/WHERE status = 'waiting' AND updated_at < now\(\) - waiting_room_ttl/);
    expect(body).toMatch(/WHERE status = 'active' AND updated_at < now\(\) - active_room_ttl/);
  });

  it("deletes only anonymous users that are idle and own nothing", () => {
    const anon = body.slice(body.indexOf("DELETE FROM auth.users"), body.indexOf("idle_anonymous_users_deleted"));
    expect(anon).toContain("u.is_anonymous");
    expect(anon).toMatch(/auth\.refresh_tokens rt\s+WHERE rt\.user_id = u\.id::text AND rt\.created_at > now\(\) - idle_anonymous_user_ttl/);
    for (const owned of ["players pl WHERE pl.user_id = u.id", "play_sessions ps WHERE ps.user_id = u.id", "daily_results dr WHERE dr.user_id = u.id", "narrator_sessions ns WHERE ns.user_id = u.id", "games g WHERE g.host_user_id = u.id"]) {
      expect(anon).toContain(`NOT EXISTS (SELECT 1 FROM ${owned})`);
    }
  });

  it("only deletes a puzzle no game references, after the grace period", () => {
    expect(body).toMatch(/DELETE FROM puzzles p\s+WHERE p\.created_at < now\(\) - orphan_puzzle_grace\s+AND NOT EXISTS \(SELECT 1 FROM games g WHERE g\.puzzle_id = p\.id\)/);
  });

  it("blanks clue detail rather than nulling a NOT NULL column", () => {
    expect(body).toMatch(/UPDATE play_sessions SET clues = '\[\]'::jsonb\s+WHERE started_at < now\(\) - play_session_clues_ttl/);
  });

  it("reports one row per step", () => {
    const steps = [...body.matchAll(/step := '(\w+)'/g)].map((m) => m[1]);
    expect(steps).toEqual([
      "waiting_rooms_closed",
      "active_rooms_closed",
      "finished_games_deleted",
      "orphan_puzzles_deleted",
      "idle_anonymous_users_deleted",
      "narrator_usage_deleted",
      "play_session_clues_blanked",
      "play_sessions_deleted",
    ]);
    expect(body.match(/GET DIAGNOSTICS n = ROW_COUNT/g)).toHaveLength(steps.length);
  });
});

describe("retention migration: the rest of the file", () => {
  it("keeps the sweep off PostgREST and runs it as its owner", () => {
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public, pg_temp");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.retention_sweep() FROM PUBLIC, anon, authenticated;");
  });

  it("schedules the sweep nightly under a fixed job name, replacing any previous definition", () => {
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron;");
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'retention-sweep'\) THEN\s+PERFORM cron\.unschedule\('retention-sweep'\);/);
    expect(sql).toMatch(/SELECT cron\.schedule\('retention-sweep', '\d+ \d+ \* \* \*', \$\$SELECT public\.retention_sweep\(\)\$\$\);/);
  });

  it("maintains games.updated_at by trigger and backfills it from the timestamps a row already has", () => {
    expect(sql).toContain("ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();");
    expect(sql).toMatch(/UPDATE games\s+SET updated_at = GREATEST\(created_at, COALESCE\(started_at, created_at\), COALESCE\(completed_at, created_at\)\)/);
    const backfill = sql.indexOf("SET updated_at = GREATEST");
    const trigger = sql.indexOf("CREATE TRIGGER games_updated_at");
    expect(backfill).toBeLessThan(trigger);
    expect(sql).toMatch(/CREATE TRIGGER games_updated_at\s+BEFORE UPDATE ON games\s+FOR EACH ROW EXECUTE FUNCTION games_set_updated_at\(\);/);
  });

  it("adds the started_at index and drops games/players from the realtime publication only when they are in it", () => {
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS play_sessions_started_idx ON play_sessions (started_at);");
    for (const table of ["games", "players"]) {
      expect(sql).toMatch(new RegExp(`IF EXISTS \\(SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = '${table}'\\) THEN\\s+ALTER PUBLICATION supabase_realtime DROP TABLE public\\.${table};`));
    }
  });
});
