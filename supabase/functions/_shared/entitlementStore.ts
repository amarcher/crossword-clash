import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { EntitlementUpsert } from "./purchaseEvents.ts";

/**
 * The service-role writes behind verify-purchase: idempotency on
 * purchase_events, the entitlements upsert, and the TRANSFER move. Every
 * function takes the client so tests (or a future reconcile job) can pass
 * their own.
 */

/**
 * Records a webhook event once. Returns false when this (source, event id) was
 * already acted on, so the caller answers 200 without doing anything again:
 * both RevenueCat and Stripe retry deliveries that time out.
 */
export async function recordEventOnce(
  admin: SupabaseClient,
  event: { source: string; eventId: string; userId: string | null; kind: string; payload: unknown },
): Promise<boolean> {
  const { error } = await admin.from("purchase_events").insert({
    source: event.source,
    event_id: event.eventId,
    user_id: event.userId,
    kind: event.kind,
    payload: event.payload,
  });
  if (!error) return true;
  // 23505: primary key (source, event_id) already there.
  if (error.code === "23505") return false;
  throw new Error(`purchase_events insert failed: ${error.message}`);
}

/**
 * Writes the row for (user, product). A store purchase key that another user
 * currently holds (the unique (source, external_id) index) is first released
 * from that user: a restore on a new device moves the purchase, as the spec
 * says ("restore = move"), and the old device's row expires.
 */
export async function upsertEntitlement(admin: SupabaseClient, row: EntitlementUpsert): Promise<void> {
  if (row.external_id) {
    const { error: releaseError } = await admin
      .from("entitlements")
      .update({ status: "expired", will_renew: false, external_id: null, updated_at: new Date().toISOString() })
      .eq("source", row.source)
      .eq("external_id", row.external_id)
      .neq("user_id", row.user_id);
    if (releaseError) throw new Error(`entitlements release failed: ${releaseError.message}`);
  }
  const { error } = await admin
    .from("entitlements")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id,product" });
  if (error) throw new Error(`entitlements upsert failed: ${error.message}`);
}

/** The rows a user holds from one source (for reconcile and account deletion). */
export async function entitlementsFor(admin: SupabaseClient, userId: string, source?: string) {
  let query = admin.from("entitlements").select("*").eq("user_id", userId);
  if (source) query = query.eq("source", source);
  const { data, error } = await query;
  if (error) throw new Error(`entitlements read failed: ${error.message}`);
  return (data ?? []) as Array<EntitlementUpsert & { created_at: string; updated_at: string }>;
}

/**
 * RevenueCat TRANSFER: the store account behind a purchase now belongs to
 * other app users. Every revenuecat row of the `from` users moves to the first
 * `to` user (there is one in practice); the losers keep an expired row so
 * their devices fall back to free on the next refresh.
 */
export async function transferEntitlements(admin: SupabaseClient, from: string[], to: string[]): Promise<void> {
  const target = to[0];
  if (!target) return;
  for (const loser of from) {
    if (loser === target) continue;
    const rows = await entitlementsFor(admin, loser, "revenuecat");
    for (const row of rows) {
      await upsertEntitlement(admin, { ...row, user_id: target });
      const { error } = await admin
        .from("entitlements")
        .update({ status: "expired", will_renew: false, external_id: null, updated_at: new Date().toISOString() })
        .eq("user_id", loser)
        .eq("product", row.product);
      if (error) throw new Error(`entitlements transfer failed: ${error.message}`);
    }
  }
}
