import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The entitlements migration is SQL, which vitest cannot run, but its shape
 * is a promise to the client and the edge functions: clients may only read
 * their own rows, nothing but the service role writes, the gate function is
 * callable from RLS, and metering is atomic. These tests read the file and
 * hold it to those promises.
 */
const here = (rel: string) => decodeURIComponent(new URL(rel, import.meta.url).pathname);
const sql = readFileSync(here("../../supabase/migrations/20261024000000_entitlements.sql"), "utf8");

const section = (from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to));

describe("entitlements migration: tables", () => {
  it("creates the three tables with RLS on", () => {
    for (const table of ["entitlements", "purchase_events", "feature_usage"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it("lets users read only their own entitlements and usage, and gives them no write policy at all", () => {
    expect(sql).toMatch(/CREATE POLICY "Users read own entitlements"\s+ON entitlements FOR SELECT\s+USING \(\(select auth\.uid\(\)\) = user_id\);/);
    expect(sql).toMatch(/CREATE POLICY "Users read own usage"\s+ON feature_usage FOR SELECT\s+USING \(\(select auth\.uid\(\)\) = user_id\);/);
    const policies = [...sql.matchAll(/CREATE POLICY "[^"]+"\s+ON (\w+) FOR (\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(policies).toEqual(["entitlements:SELECT", "feature_usage:SELECT"]);
    // purchase_events has RLS on and no policy: service role only.
    expect(policies.some((p) => p.startsWith("purchase_events"))).toBe(false);
  });

  it("constrains products, sources and statuses to the spec's vocabularies", () => {
    const ent = section("CREATE TABLE IF NOT EXISTS entitlements", "CREATE UNIQUE INDEX");
    expect(ent).toContain("CHECK (product IN ('plus', 'supporter'))");
    expect(ent).toContain("CHECK (source IN ('revenuecat', 'stripe', 'apple', 'google', 'grant'))");
    expect(ent).toContain("CHECK (status IN ('active', 'grace', 'expired', 'revoked'))");
    expect(ent).toContain("PRIMARY KEY (user_id, product)");
    expect(ent).toContain("REFERENCES auth.users (id) ON DELETE CASCADE");
    expect(section("CREATE TABLE IF NOT EXISTS feature_usage", "ALTER TABLE feature_usage")).toContain("CHECK (feature IN ('narrator_minutes', 'studio_claude', 'narrator_claude_calls'))");
  });

  it("keys a store purchase to one user at a time, and keeps billing records when the user goes", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS entitlements_external_key\s+ON entitlements \(source, external_id\) WHERE external_id IS NOT NULL;/);
    const events = section("CREATE TABLE IF NOT EXISTS purchase_events", "CREATE INDEX IF NOT EXISTS purchase_events_user_idx");
    expect(events).toContain("PRIMARY KEY (source, event_id)");
    expect(events).toContain("user_id     UUID REFERENCES auth.users (id) ON DELETE SET NULL");
  });
});

describe("entitlements migration: functions", () => {
  it("defines has_entitlement as a STABLE SECURITY DEFINER callable by authenticated users, counting active and grace rows that have not expired", () => {
    const fn = section("CREATE OR REPLACE FUNCTION public.has_entitlement", "REVOKE ALL ON FUNCTION public.has_entitlement");
    expect(fn).toContain("STABLE");
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = public, pg_temp");
    expect(fn).toContain("AND e.status IN ('active', 'grace')");
    expect(fn).toContain("AND (e.expires_at IS NULL OR e.expires_at > now())");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.has_entitlement(UUID, TEXT) TO authenticated, service_role;");
  });

  it("meters allowances in one conditional UPDATE and keeps the function off the client", () => {
    const fn = section("CREATE OR REPLACE FUNCTION public.consume_allowance", "REVOKE ALL ON FUNCTION public.consume_allowance");
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toMatch(/UPDATE feature_usage fu\s+SET used = fu\.used \+ p_amount, updated_at = now\(\)\s+WHERE[\s\S]*AND fu\.used \+ p_amount <= p_limit \+ fu\.bonus\s+RETURNING/);
    expect(fn).toContain("ON CONFLICT (user_id, feature, month) DO NOTHING");
    expect(fn).toContain("date_trunc('month', now() AT TIME ZONE 'utc')");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.consume_allowance(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.consume_allowance(UUID, TEXT, INTEGER, INTEGER) TO service_role;");
  });

  it("redefines the retention sweep so a user with an entitlement is never swept as idle", () => {
    const sweep = section("CREATE OR REPLACE FUNCTION public.retention_sweep()", "REVOKE ALL ON FUNCTION public.retention_sweep()");
    expect(sweep).toContain("AND NOT EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = u.id)");
    // The windows are unchanged from the retention migration.
    const retention = readFileSync(here("../../supabase/migrations/20261023000000_retention.sql"), "utf8");
    const constants = (text: string) => [...text.matchAll(/(\w+) CONSTANT INTERVAL := INTERVAL '[^']+'/g)].map((m) => m[0]);
    expect(constants(sweep)).toEqual(constants(retention));
  });
});
